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
import {
  Campaign,
  CampaignType,
  CampaignStatus,
} from "@features/campaign/models/campaign.model";

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

      // Calculate the starting time for this round
      const scheduledStartTime =
        i === 0
          ? new Date()
          : new Date(Date.now() + i * config.roundInterval * 60 * 1000); // Use configured interval

      // Calculate the next round time if applicable
      const nextRoundTime =
        i < config.numberOfRounds - 1
          ? new Date(Date.now() + (i + 1) * config.roundInterval * 60 * 1000)
          : undefined;

      // For testing with short delays, use this instead:
      // const scheduledStartTime = i === 0 ? new Date() : new Date(Date.now() + i * 60 * 1000); // 1 minute between rounds
      // const nextRoundTime = i < config.numberOfRounds - 1 ? new Date(Date.now() + (i + 1) * 60 * 1000) : undefined;

      const round = await OptimizationRound.create({
        userId: new Types.ObjectId(config.userId),
        campaignProcessId: campaignProcess._id,
        roundNumber: i + 1,
        status: OptimizationStatus.PENDING,
        startDate: scheduledStartTime,
        subscriberSegmentIds: roundSubscriberIds.map(
          (id: string) => new Types.ObjectId(id)
        ),
        offerIds: config.offerIds.map((id: string) => new Types.ObjectId(id)),
        nextRoundScheduledFor: nextRoundTime,
      });

      roundIds.push(round.id);

      console.log(
        `Created round ${i + 1} of ${
          config.numberOfRounds
        }, scheduled for: ${scheduledStartTime}`
      );
    }

    // Start the first round immediately
    await this.processRound(roundIds[0], config);

    // Schedule subsequent rounds based on configured intervals
    for (let i = 1; i < roundIds.length; i++) {
      const roundDelay = i * config.roundInterval * 60 * 1000; // Convert minutes to milliseconds
      const roundIndex = i; // Capture the current value of i for the closure
      const roundNumber = i + 1;

      console.log(
        `Scheduling round ${roundNumber} to start in ${
          roundDelay / (60 * 1000)
        } minutes...`
      );

      setTimeout(async () => {
        console.log(`Starting round ${roundNumber} now`);
        await this.processRound(roundIds[roundIndex], config).catch((err) => {
          console.error(`Error processing round ${roundNumber}:`, err);
        });
      }, roundDelay);
    }

    // For testing with short delays, use this instead:
    // for (let i = 1; i < roundIds.length; i++) {
    //   const delay = 30 * 1000; // 30 seconds (reduced from normal interval for testing)
    //   const roundIndex = i;
    //   const roundNumber = i + 1;
    //   console.log(`Scheduling round ${roundNumber} to start in ${delay/1000} seconds...`);
    //
    //   setTimeout(async () => {
    //     console.log(`Starting round ${roundNumber} now`);
    //     await this.processRound(roundIds[roundIndex], config).catch((err) => {
    //       console.error(`Error processing round ${roundNumber}:`, err);
    //     });
    //   }, delay);
    // }

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

      // For rounds after the first, train the model before creating segments
      // This ensures we use the latest data for generating parameter combinations
      if (round.roundNumber > 1) {
        await this.optimizationAgent.trainModel(
          round.campaignProcessId.toString()
        );
        console.log(`Trained model for round ${round.roundNumber}`);
      }

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
      console.log(
        `Waiting for metrics collection before analyzing round ${round.roundNumber}...`
      );
      await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000)); // 1 hour

      // For testing with mock metrics, use a shorter wait time:
      // console.log(`Waiting 10 seconds before collecting metrics for round ${round.roundNumber}...`);
      // await new Promise((resolve) => setTimeout(resolve, 10 * 1000)); // 10 seconds

      // Update metrics for each segment
      for (const segmentId of segmentIds) {
        await this.optimizationAgent.updateSegmentMetrics(segmentId);
      }

      // Analyze round performance
      const analysis = await this.optimizationAgent.analyzeRoundPerformance(
        roundId
      );
      console.log(`Round ${round.roundNumber} analysis:`, {
        bestParameters: analysis.bestParameters,
        metrics: analysis.metrics,
      });

      // If this is the last round, check if the process is complete
      if (round.roundNumber >= config.numberOfRounds) {
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

      console.log(
        `Processing segment ${segmentId} with parameters:`,
        segment.assignedParameters
      );

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

      /* MOCK IMPLEMENTATION - COMMENTED OUT FOR LATER USE
      // Log offer IDs from the round
      console.log(`Available offer IDs for round ${round._id}:`, round.offerIds);

      if (!round.offerIds || round.offerIds.length === 0) {
        throw new Error("No offer IDs found for this round. At least one offer ID is required.");
      }

      // Choose a valid offer ID
      let offerId;
      if (round.offerIds && round.offerIds.length > 0) {
        offerId = round.offerIds[0];
      } else if (config.offerIds && config.offerIds.length > 0) {
        // Fallback to config offerIds
        offerId = new Types.ObjectId(config.offerIds[0]);
        console.log(`No offer IDs in round, using fallback from config: ${offerId}`);
      } else {
        throw new Error("No offer IDs available for campaign creation");
      }

      // MOCK IMPLEMENTATION: Generate mock metrics based on assigned parameters
      // This simulates how different parameter combinations might perform differently

      // Base metrics that will be adjusted based on parameters
      const baseMetrics = {
        totalSent: Math.floor(Math.random() * 100) + 100, // 100-199 emails sent
        totalOpens: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0
      };
      
      // Adjust metrics based on copywriting style
      const copywritingMultiplier = (() => {
        switch(segment.assignedParameters.copywritingStyle) {
          case "AIDA": return 1.2;  // AIDA performs well
          case "PAS": return 1.15;  // Problem-Agitate-Solution also good
          case "BAB": return 1.1;   // Before-After-Bridge
          case "FAB": return 1.05;  // Features-Advantages-Benefits
          case "QUEST": return 1.0; // QUEST framework
          default: return 1.0;
        }
      })();
      
      // Adjust metrics based on writing style
      const writingStyleMultiplier = (() => {
        switch(segment.assignedParameters.writingStyle) {
          case "conversational": return 1.25; // Conversational performs best
          case "persuasive": return 1.2;      // Persuasive is strong
          case "direct": return 1.15;         // Direct is effective
          case "descriptive": return 1.0;     // Descriptive is average
          case "narrative": return 1.05;      // Narrative is slightly above average
          default: return 1.0;
        }
      })();
      
      // Adjust metrics based on tone
      const toneMultiplier = (() => {
        switch(segment.assignedParameters.tone) {
          case "friendly": return 1.2;       // Friendly performs well
          case "enthusiastic": return 1.15;  // Enthusiasm works
          case "professional": return 1.1;   // Professional is solid
          case "urgent": return 1.05;        // Urgency can help
          case "empathetic": return 1.25;    // Empathy performs best
          default: return 1.0;
        }
      })();
      
      // Adjust metrics based on personality
      const personalityMultiplier = (() => {
        switch(segment.assignedParameters.personality) {
          case "confident": return 1.2;      // Confidence performs well
          case "trustworthy": return 1.25;   // Trustworthiness is best
          case "caring": return 1.15;        // Caring works well
          case "humorous": return 1.1;       // Humor can work
          case "innovative": return 1.05;    // Innovation is decent
          default: return 1.0;
        }
      })();
      
      // Add some randomization (±15%) to make it more realistic
      const randomFactor = 0.85 + (Math.random() * 0.3);
      
      // Calculate combined multiplier with randomization
      const combinedMultiplier = 
        copywritingMultiplier * 
        writingStyleMultiplier * 
        toneMultiplier * 
        personalityMultiplier * 
        randomFactor;
      
      // Calculate open rate (40-80%) based on multiplier
      const openRate = Math.min(0.8, Math.max(0.4, 0.4 * combinedMultiplier));
      baseMetrics.totalOpens = Math.floor(baseMetrics.totalSent * openRate);
      
      // Calculate click rate (10-40% of opens) based on multiplier
      const clickRate = Math.min(0.4, Math.max(0.1, 0.1 * combinedMultiplier));
      baseMetrics.totalClicks = Math.floor(baseMetrics.totalOpens * clickRate);
      
      // Calculate conversion rate (5-25% of clicks) based on multiplier
      const conversionRate = Math.min(0.25, Math.max(0.05, 0.05 * combinedMultiplier));
      baseMetrics.totalConversions = Math.floor(baseMetrics.totalClicks * conversionRate);
      
      // Calculate average revenue per conversion ($20-100)
      const avgRevenue = Math.floor(20 + (80 * Math.random() * combinedMultiplier));
      baseMetrics.totalRevenue = baseMetrics.totalConversions * avgRevenue;
      
      console.log(`Generated mock metrics for segment ${segmentId}:`, {
        parameters: segment.assignedParameters,
        metrics: baseMetrics,
        multipliers: {
          copywriting: copywritingMultiplier,
          writingStyle: writingStyleMultiplier,
          tone: toneMultiplier,
          personality: personalityMultiplier,
          random: randomFactor,
          combined: combinedMultiplier
        },
        rates: {
          openRate: openRate.toFixed(2),
          clickRate: clickRate.toFixed(2),
          conversionRate: conversionRate.toFixed(2)
        }
      });

      // Create mock campaign with these metrics
      const campaign = await Campaign.create({
        userId: new Types.ObjectId(config.userId),
        name: `Mock Campaign for Segment ${segmentId}`,
        subject: `Test email for ${segment.assignedParameters.copywritingStyle} style`,
        content: `This is a mock email using ${segment.assignedParameters.copywritingStyle} framework, 
                 ${segment.assignedParameters.writingStyle} writing style, 
                 ${segment.assignedParameters.tone} tone, and 
                 ${segment.assignedParameters.personality} personality.`,
        type: CampaignType.EMAIL, // Using the enum
        offerId: offerId, // Using the validated offer ID
        writingStyle: segment.assignedParameters.writingStyle, // Required field
        metrics: baseMetrics,
        segmentId: new Types.ObjectId(segmentId),
        status: CampaignStatus.COMPLETED, // Using the enum
        sentAt: new Date(),
        createdAt: new Date()
      });

      // Update segment with campaign ID and metrics
      await SubscriberSegment.findByIdAndUpdate(segmentId, {
        campaignIds: [campaign._id],
        metrics: {
          ...baseMetrics,
          openRate,
          clickRate,
          conversionRate,
        },
        status: SegmentStatus.PROCESSED,
      });

      console.log(`Segment ${segmentId} processed with mock campaign ${campaign._id}`);
      */
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
