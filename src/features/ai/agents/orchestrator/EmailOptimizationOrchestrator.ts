import { Types } from "mongoose";
import {
  SegmentationAgent,
  ISegmentationConfig,
} from "../segmentation/SegmentationAgent";
import { WritingStyleOptimizationAgent } from "../writing-style/WritingStyleOptimizationAgent";
import { EmailOptimizationAgent } from "../reinforcement-learning/EmailOptimizationAgent";
import { CampaignProcess } from "../../models/campaign-process.model";
import {
  OptimizationRound,
  OptimizationStatus,
} from "../../models/optimization-round.model";
import {
  SubscriberSegment,
  SegmentStatus,
} from "../../models/subscriber-segment.model";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { SubscriberList } from "@features/subscriber/models/subscriber-list.model";
import { UserService } from "@features/user/user.service";

export interface IOptimizationConfig {
  userId: string;
  subscriberListId: string;
  offerIds: string[];
  selectionPercentage: number;
  numberOfRounds: number;
  segmentationConfig: ISegmentationConfig;
  smtpProviderId: string;
  senderName: string;
  senderEmail: string;
  aiProvider: "openai" | "claude";
  roundInterval: number; // Time in minutes between rounds
}

export class EmailOptimizationOrchestrator {
  private segmentationAgent: SegmentationAgent;
  private writingStyleAgent: WritingStyleOptimizationAgent;
  private optimizationAgent: EmailOptimizationAgent;

  constructor() {
    this.segmentationAgent = new SegmentationAgent();
    this.writingStyleAgent = new WritingStyleOptimizationAgent();
    this.optimizationAgent = new EmailOptimizationAgent();
  }

  /**
   * Starts the email optimization process
   *
   * @param config - Configuration for the optimization process
   * @returns ID of the created campaign process
   */
  public async startOptimizationProcess(
    config: IOptimizationConfig
  ): Promise<string> {
    // Create a campaign process to track the overall process
    const campaignProcess = await CampaignProcess.create({
      userId: new Types.ObjectId(config.userId),
      status: "pending",
    });

    // Get subscribers from the list
    const subscriberList = await SubscriberList.findById(
      config.subscriberListId
    );
    if (!subscriberList) {
      throw new Error("Subscriber list not found");
    }

    // Get active subscribers from the list
    const subscribers = await Subscriber.find({
      lists: { $in: [new Types.ObjectId(config.subscriberListId)] },
      status: "active",
    });

    if (!subscribers.length) {
      throw new Error("No active subscribers found in the list");
    }

    // Calculate how many subscribers to use for the optimization process
    const totalSubscribers = subscribers.length;
    const subscribersToUse = Math.floor(
      totalSubscribers * config.selectionPercentage
    );

    if (subscribersToUse < 10) {
      throw new Error(
        "Not enough subscribers for optimization (minimum 10 required)"
      );
    }

    // Get subscriber IDs
    const subscriberIds = subscribers
      .slice(0, subscribersToUse)
      .map((sub) => sub.id);

    // Calculate subscribers per round
    const subscribersPerRound = Math.floor(
      subscribersToUse / config.numberOfRounds
    );

    if (subscribersPerRound < 5) {
      throw new Error("Not enough subscribers per round (minimum 5 required)");
    }

    // Create optimization rounds
    const roundIds: string[] = [];

    for (let i = 0; i < config.numberOfRounds; i++) {
      const startIndex = i * subscribersPerRound;
      const endIndex =
        i === config.numberOfRounds - 1
          ? subscribersToUse // Last round gets any remaining subscribers
          : startIndex + subscribersPerRound;

      const roundSubscriberIds = subscriberIds.slice(startIndex, endIndex);

      // Create the optimization round
      const round = await OptimizationRound.create({
        userId: new Types.ObjectId(config.userId),
        campaignProcessId: campaignProcess._id,
        roundNumber: i + 1,
        status: OptimizationStatus.PENDING,
        startDate:
          i === 0
            ? new Date()
            : new Date(Date.now() + i * config.roundInterval * 60 * 1000),
        subscriberSegmentIds: roundSubscriberIds.map(
          (id) => new Types.ObjectId(id)
        ),
        offerIds: config.offerIds.map((id) => new Types.ObjectId(id)),
        nextRoundScheduledFor:
          i < config.numberOfRounds - 1
            ? new Date(Date.now() + (i + 1) * config.roundInterval * 60 * 1000)
            : undefined,
      });

      roundIds.push(round.id);
    }

    // Start the first round immediately
    await this.processRound(roundIds[0], config);

    // Schedule subsequent rounds
    for (let i = 1; i < roundIds.length; i++) {
      const delay = i * config.roundInterval * 60 * 1000;
      setTimeout(() => {
        this.processRound(roundIds[i], config).catch((err) => {
          console.error(`Error processing round ${i + 1}:`, err);
        });
      }, delay);
    }

    // Update campaign process status
    await CampaignProcess.findByIdAndUpdate(campaignProcess._id, {
      status: "processing",
    });

    return campaignProcess.id;
  }

  /**
   * Processes a single optimization round
   *
   * @param roundId - ID of the round to process
   * @param config - Configuration for the optimization process
   */
  private async processRound(
    roundId: string,
    config: IOptimizationConfig
  ): Promise<void> {
    try {
      // Get the optimization round
      const round = await OptimizationRound.findById(roundId);
      if (!round) {
        throw new Error("Optimization round not found");
      }

      // Update round status
      await OptimizationRound.findByIdAndUpdate(roundId, {
        status: OptimizationStatus.IN_PROGRESS,
      });

      // Get subscriber IDs for this round
      const subscriberIds = round.subscriberSegmentIds.map((id) =>
        id.toString()
      );

      // Create segments for this round
      const segmentIds = await this.segmentationAgent.segmentSubscribers(
        subscriberIds,
        roundId,
        config.userId,
        round.campaignProcessId.toString(),
        config.segmentationConfig
      );

      // Process each segment
      for (const segmentId of segmentIds) {
        await this.processSegment(segmentId, config);
      }

      // Wait for a reasonable time for metrics to be collected
      await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000)); // 1 hour

      // Update metrics for each segment
      for (const segmentId of segmentIds) {
        await this.optimizationAgent.updateSegmentMetrics(segmentId);
      }

      // Analyze round performance
      const analysis = await this.optimizationAgent.analyzeRoundPerformance(
        roundId
      );

      // If there are more rounds, train the model
      if (round.roundNumber < config.numberOfRounds) {
        await this.optimizationAgent.trainModel(
          round.campaignProcessId.toString()
        );
      } else {
        // This is the last round, check if the process is complete
        await this.optimizationAgent.checkProcessCompletion(
          round.campaignProcessId.toString()
        );
      }
    } catch (error) {
      console.error(`Error processing round ${roundId}:`, error);

      // Update round status to failed
      await OptimizationRound.findByIdAndUpdate(roundId, {
        status: OptimizationStatus.FAILED,
      });
    }
  }

  /**
   * Processes a single segment by sending emails to subscribers
   *
   * @param segmentId - ID of the segment to process
   * @param config - Configuration for the optimization process
   */
  private async processSegment(
    segmentId: string,
    config: IOptimizationConfig
  ): Promise<void> {
    try {
      // Get the segment
      const segment = await SubscriberSegment.findById(segmentId);
      if (!segment) {
        throw new Error("Segment not found");
      }

      // Get the optimization round
      const round = await OptimizationRound.findById(
        segment.optimizationRoundId
      );
      if (!round) {
        throw new Error("Optimization round not found");
      }

      // Get offer IDs
      const offerIds = round.offerIds.map((id) => id.toString());

      // Send emails using the WritingStyleOptimizationAgent
      const emailResults = await this.writingStyleAgent.startRandomCampaign(
        offerIds,
        config.subscriberListId,
        config.smtpProviderId,
        config.userId,
        1.0, // Use 100% of the subscribers in this segment
        config.senderName,
        config.senderEmail,
        config.aiProvider
      );

      // Collect campaign IDs
      const campaignIds: string[] = [];
      emailResults.forEach((offerResults) => {
        offerResults.forEach((result) => {
          if (!campaignIds.includes(result.campaignId)) {
            campaignIds.push(result.campaignId);
          }
        });
      });

      // Update segment with campaign IDs
      await SubscriberSegment.findByIdAndUpdate(segmentId, {
        campaignIds: campaignIds.map((id) => new Types.ObjectId(id)),
        status: SegmentStatus.PROCESSED,
      });
    } catch (error) {
      console.error(`Error processing segment ${segmentId}:`, error);

      // Update segment status to skipped
      await SubscriberSegment.findByIdAndUpdate(segmentId, {
        status: SegmentStatus.SKIPPED,
      });
    }
  }

  /**
   * Checks the status of an optimization process
   *
   * @param processId - ID of the campaign process
   * @returns Status of the process
   */
  public async checkProcessStatus(processId: string): Promise<{
    status: string;
    completedRounds: number;
    totalRounds: number;
    bestParameters?: {
      copywritingStyle: string;
      writingStyle: string;
      tone: string;
      personality: string;
      conversionRate: number;
      clickRate: number;
    };
  }> {
    // Get the campaign process
    const process = await CampaignProcess.findById(processId);
    if (!process) {
      throw new Error("Campaign process not found");
    }

    // Get all rounds for this process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(processId),
    });

    // Count completed rounds
    const completedRounds = rounds.filter(
      (round) => round.status === OptimizationStatus.COMPLETED
    ).length;

    // Get best parameters if process is completed
    let bestParameters;
    if (
      process.status === "completed" &&
      process.result &&
      process.result.bestParameters
    ) {
      bestParameters = process.result.bestParameters;
    }

    return {
      status: process.status,
      completedRounds,
      totalRounds: rounds.length,
      bestParameters,
    };
  }
}
