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
import { SmtpService } from "@features/email/smtp/smtp.service";
import { User } from "@features/user/models/user.model";

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
  roundInterval: number; // Time between rounds in minutes (e.g., 1440 = 24 hours)
  campaignName?: string; // Optional campaign name
  waitTimeForMetrics?: number; // Time to wait for metrics collection in minutes (e.g., 60 = 1 hour)
}

export class EmailOptimizationOrchestrator {
  private segmentationAgent: SegmentationAgent;
  private writingStyleAgent: WritingStyleOptimizationAgent;
  private optimizationAgent: EmailOptimizationAgent;

  constructor() {
    // Create the optimization agent first
    this.optimizationAgent = new EmailOptimizationAgent();
    // Pass the optimization agent to the segmentation agent
    this.segmentationAgent = new SegmentationAgent(this.optimizationAgent);
    this.writingStyleAgent = new WritingStyleOptimizationAgent();
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
      name:
        config.campaignName ||
        `Email Optimization for List ${config.subscriberListId}`,
      status: "pending",
      aiProvider: config.aiProvider,
      smtpProviderId: new Types.ObjectId(config.smtpProviderId),
      senderName: config.senderName,
      senderEmail: config.senderEmail,
      configuration: config, // Store the complete configuration
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
      // const scheduledStartTime =
      //   i === 0 ? new Date() : new Date(Date.now() + i * 60 * 1000); // 1 minute between rounds
      // const nextRoundTime =
      //   i < config.numberOfRounds - 1
      //     ? new Date(Date.now() + (i + 1) * 60 * 1000)
      //     : undefined;

      const round = await OptimizationRound.create({
        userId: new Types.ObjectId(config.userId),
        campaignProcessId: campaignProcess._id,
        roundNumber: i + 1,
        status: OptimizationStatus.PENDING,
        startDate: scheduledStartTime,
        subscriberIds: roundSubscriberIds.map(
          (id: string) => new Types.ObjectId(id)
        ),
        subscriberSegmentIds: [],
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

    // Start the first round immediately but don't await it
    console.log("Starting the first optimization round asynchronously...");
    this.processRound(roundIds[0], config).catch((err) => {
      console.error(`Error processing first round:`, err);
    });

    // The remaining rounds will be automatically processed by the ScheduledTaskService
    // based on their scheduled startDate, which was set when creating the rounds
    console.log(
      "Subsequent rounds will be processed by the scheduled task service based on their start dates"
    );

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
  public async processRound(
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
      const subscriberIds = round.subscriberIds.map((id) => id.toString());

      if (subscriberIds.length === 0) {
        throw new Error("No subscribers found for this round");
      }

      console.log(
        `Processing round ${round.roundNumber} with ${subscriberIds.length} subscribers`
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

      console.log(
        `Created ${segmentIds.length} segments for round ${round.roundNumber}`
      );

      // Update the round with created segment IDs
      await OptimizationRound.findByIdAndUpdate(roundId, {
        subscriberSegmentIds: segmentIds.map((id) => new Types.ObjectId(id)),
      });

      // Process each segment
      for (const segmentId of segmentIds) {
        await this.processSegment(segmentId, config);
      }

      const waitTimeInMinutes = config.waitTimeForMetrics || 60; // Default to 1 hour
      const metricsAnalysisTime = new Date();
      metricsAnalysisTime.setMinutes(
        metricsAnalysisTime.getMinutes() + waitTimeInMinutes
      );

      console.log(
        `Scheduling metrics analysis for round ${
          round.roundNumber
        } at ${metricsAnalysisTime.toISOString()}`
      );

      // Update the round with the scheduled analysis time
      await OptimizationRound.findByIdAndUpdate(roundId, {
        metricsAnalysisTime: metricsAnalysisTime,
        // Set the status to indicate the round is waiting for metrics
        status: OptimizationStatus.WAITING_FOR_METRICS,
      });
    } catch (error) {
      console.error(`Error processing round ${roundId}:`, error);

      // Update round status to failed
      await OptimizationRound.findByIdAndUpdate(roundId, {
        status: OptimizationStatus.FAILED,
      });
    }
  }

  /**
   * Analyzes the results of an optimization round once metrics have been collected
   *
   * @param roundId - ID of the round to analyze
   * @param config - Configuration for the optimization process
   */
  public async analyzeRoundResults(
    roundId: string,
    config: IOptimizationConfig
  ): Promise<void> {
    try {
      // Get the optimization round
      const round = await OptimizationRound.findById(roundId);
      if (!round) {
        throw new Error("Optimization round not found");
      }

      console.log(`Starting analysis for round ${round.roundNumber}`);

      // Update round status to analyzing
      await OptimizationRound.findByIdAndUpdate(roundId, {
        status: OptimizationStatus.ANALYZING,
      });

      // Update metrics for each segment
      for (const segmentId of round.subscriberSegmentIds) {
        await this.optimizationAgent.updateSegmentMetrics(segmentId.toString());
      }

      // Analyze round performance
      const analysis = await this.optimizationAgent.analyzeRoundPerformance(
        roundId
      );
      console.log(`Round ${round.roundNumber} analysis:`, {
        bestParameters: analysis.bestParameters,
        metrics: analysis.metrics,
      });

      // Mark the round as completed
      await OptimizationRound.findByIdAndUpdate(roundId, {
        status: OptimizationStatus.COMPLETED,
        endDate: new Date(),
      });

      // If this is the last round, check if the process is complete
      if (round.roundNumber >= config.numberOfRounds) {
        await this.optimizationAgent.checkProcessCompletion(
          round.campaignProcessId.toString()
        );

        // Send completion notification email
        await this.sendOptimizationCompletionEmail(
          round.campaignProcessId.toString(),
          config
        );
      }
    } catch (error) {
      console.error(`Error analyzing round ${roundId}:`, error);

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

      // Get subscriber IDs from the segment
      const subscriberIds = segment.subscriberIds.map((id) => id.toString());

      if (subscriberIds.length === 0) {
        throw new Error("No subscribers found in segment");
      }

      // Get subscriber list for audience description
      const subscriberList = await SubscriberList.findById(
        config.subscriberListId
      );
      const audienceDescription =
        subscriberList?.description || "General audience";

      console.log(`Using audience description: ${audienceDescription}`);

      try {
        const emailResults =
          await this.writingStyleAgent.startCampaignForSegment(
            offerIds,
            subscriberIds,
            config.smtpProviderId,
            config.userId,
            config.senderName,
            config.senderEmail,
            config.aiProvider,
            segment.assignedParameters,
            audienceDescription
          );

        // Collect campaign IDs
        const campaignIds: string[] = [];
        const emailsToSave: Array<{
          subscriberId: Types.ObjectId;
          subject: string;
          body: string;
          generatedPrompt?: string;
          aiProvider?: string;
          aiModel?: string;
          offerId?: Types.ObjectId;
          campaignId?: Types.ObjectId;
          styleParameters: {
            copywritingStyle: string;
            writingStyle: string;
            tone: string;
            personality: string;
          };
        }> = [];

        emailResults.forEach((offerResults) => {
          offerResults.forEach((result) => {
            if (!campaignIds.includes(result.campaignId)) {
              campaignIds.push(result.campaignId);
            }

            // Save email data for each subscriber
            emailsToSave.push({
              subscriberId: new Types.ObjectId(result.subscriberId),
              subject: result.subject,
              body: result.content,
              generatedPrompt: result.generatedPrompt,
              aiProvider: result.aiProvider,
              aiModel: result.aiModel,
              offerId: new Types.ObjectId(result.offerId),
              campaignId: new Types.ObjectId(result.campaignId),
              styleParameters: {
                copywritingStyle: segment.assignedParameters.copywritingStyle,
                writingStyle: segment.assignedParameters.writingStyle,
                tone: segment.assignedParameters.tone,
                personality: segment.assignedParameters.personality,
              },
            });
          });
        });

        // Update segment with campaign IDs
        await SubscriberSegment.findByIdAndUpdate(segmentId, {
          campaignIds: campaignIds.map((id) => new Types.ObjectId(id)),
          status: SegmentStatus.PROCESSED,
        });

        // Save emails to optimization round
        await OptimizationRound.findByIdAndUpdate(segment.optimizationRoundId, {
          $push: { emailsSent: { $each: emailsToSave } },
        });

        return;
      } catch (error) {
        console.log(
          "Error using real implementation, falling back to mock:",
          error
        );
        // If real implementation fails, continue with mock implementation
      }

      // -------- MOCK IMPLEMENTATION BELOW - FALLBACK --------

      // console.log(
      //   `Available offer IDs for round ${round._id}:`,
      //   round.offerIds
      // );

      // if (!round.offerIds || round.offerIds.length === 0) {
      //   throw new Error(
      //     "No offer IDs found for this round. At least one offer ID is required."
      //   );
      // }

      // // Instead of using just one offer, we'll create campaigns for ALL offers
      // const mockCampaignIds: Types.ObjectId[] = [];
      // const mockEmailsToSave: Array<{
      //   subscriberId: Types.ObjectId;
      //   subject: string;
      //   body: string;
      //   generatedPrompt?: string;
      //   aiProvider?: string;
      //   aiModel?: string;
      //   offerId?: Types.ObjectId;
      //   campaignId?: Types.ObjectId;
      //   styleParameters?: {
      //     copywritingStyle: string;
      //     writingStyle: string;
      //     tone: string;
      //     personality: string;
      //   };
      // }> = [];

      // // Base metrics calculator function to ensure consistent calculation
      // const calculateMetricsForParameters = (params: any) => {
      //   // Base metrics that will be adjusted based on parameters
      //   const baseMetrics = {
      //     totalSent: Math.floor(Math.random() * 100) + 100, // 100-199 emails sent
      //     totalOpens: 0,
      //     totalClicks: 0,
      //     totalConversions: 0,
      //     totalRevenue: 0,
      //   };

      //   // Adjust metrics based on copywriting style
      //   const copywritingMultiplier = (() => {
      //     switch (params.copywritingStyle) {
      //       case "AIDA":
      //         return 1.2; // AIDA performs well
      //       case "PAS":
      //         return 1.15; // Problem-Agitate-Solution also good
      //       case "BAB":
      //         return 1.1; // Before-After-Bridge
      //       case "FAB":
      //         return 1.05; // Features-Advantages-Benefits
      //       case "QUEST":
      //         return 1.0; // QUEST framework
      //       default:
      //         return 1.0;
      //     }
      //   })();

      //   // Adjust metrics based on writing style
      //   const writingStyleMultiplier = (() => {
      //     switch (params.writingStyle) {
      //       case "conversational":
      //         return 1.25; // Conversational performs best
      //       case "persuasive":
      //         return 1.2; // Persuasive is strong
      //       case "direct":
      //         return 1.15; // Direct is effective
      //       case "descriptive":
      //         return 1.0; // Descriptive is average
      //       case "narrative":
      //         return 1.05; // Narrative is slightly above average
      //       default:
      //         return 1.0;
      //     }
      //   })();

      //   // Adjust metrics based on tone
      //   const toneMultiplier = (() => {
      //     switch (params.tone) {
      //       case "friendly":
      //         return 1.2; // Friendly performs well
      //       case "enthusiastic":
      //         return 1.15; // Enthusiasm works
      //       case "professional":
      //         return 1.1; // Professional is solid
      //       case "urgent":
      //         return 1.05; // Urgency can help
      //       case "empathetic":
      //         return 1.25; // Empathy performs best
      //       default:
      //         return 1.0;
      //     }
      //   })();

      //   // Adjust metrics based on personality
      //   const personalityMultiplier = (() => {
      //     switch (params.personality) {
      //       case "confident":
      //         return 1.2; // Confidence performs well
      //       case "trustworthy":
      //         return 1.25; // Trustworthiness is best
      //       case "caring":
      //         return 1.15; // Caring works well
      //       case "humorous":
      //         return 1.1; // Humor can work
      //       case "innovative":
      //         return 1.05; // Innovation is decent
      //       default:
      //         return 1.0;
      //     }
      //   })();

      //   // Add some randomization (±15%) to make it more realistic
      //   const randomFactor = 0.85 + Math.random() * 0.3;

      //   // Calculate combined multiplier with randomization
      //   const combinedMultiplier =
      //     copywritingMultiplier *
      //     writingStyleMultiplier *
      //     toneMultiplier *
      //     personalityMultiplier *
      //     randomFactor;

      //   // Calculate open rate (40-80%) based on multiplier
      //   const openRate = Math.min(0.8, Math.max(0.4, 0.4 * combinedMultiplier));
      //   baseMetrics.totalOpens = Math.floor(baseMetrics.totalSent * openRate);

      //   // Calculate click rate (10-40% of opens) based on multiplier
      //   const clickRate = Math.min(
      //     0.4,
      //     Math.max(0.1, 0.1 * combinedMultiplier)
      //   );
      //   baseMetrics.totalClicks = Math.floor(
      //     baseMetrics.totalOpens * clickRate
      //   );

      //   // Calculate conversion rate (5-25% of clicks) based on multiplier
      //   const conversionRate = Math.min(
      //     0.25,
      //     Math.max(0.05, 0.05 * combinedMultiplier)
      //   );
      //   baseMetrics.totalConversions = Math.floor(
      //     baseMetrics.totalClicks * conversionRate
      //   );

      //   // Calculate average revenue per conversion ($20-100)
      //   const avgRevenue = Math.floor(
      //     20 + 80 * Math.random() * combinedMultiplier
      //   );
      //   baseMetrics.totalRevenue = baseMetrics.totalConversions * avgRevenue;

      //   return {
      //     metrics: baseMetrics,
      //     rates: {
      //       openRate,
      //       clickRate,
      //       conversionRate,
      //     },
      //   };
      // };

      // // Array to track all metrics for the segment
      // const allMetrics = {
      //   totalSent: 0,
      //   totalOpens: 0,
      //   totalClicks: 0,
      //   totalConversions: 0,
      //   totalRevenue: 0,
      // };

      // // Process each offer ID from the round
      // for (const offerId of round.offerIds) {
      //   // Calculate metrics for this offer with the segment's parameters
      //   const { metrics, rates } = calculateMetricsForParameters(
      //     segment.assignedParameters
      //   );

      //   // Create a fictional offer name (in a real implementation, you'd fetch this from the database)
      //   const offerName = `Offer ${offerId.toString().substring(0, 5)}`;

      //   // Create mock campaign with these metrics for this specific offer
      //   const campaign = await Campaign.create({
      //     userId: new Types.ObjectId(config.userId),
      //     name: `Mock Campaign for Segment ${segmentId} - ${offerName}`,
      //     subject: `Test email for ${offerName} using ${segment.assignedParameters.copywritingStyle} style`,
      //     content: `This is a mock email for offer ${offerName} using ${segment.assignedParameters.copywritingStyle} framework,
      //              ${segment.assignedParameters.writingStyle} writing style,
      //              ${segment.assignedParameters.tone} tone, and
      //              ${segment.assignedParameters.personality} personality.`,
      //     type: CampaignType.EMAIL,
      //     status: CampaignStatus.COMPLETED,
      //     offerId: offerId,
      //     framework: segment.assignedParameters.copywritingStyle,
      //     writingStyle: segment.assignedParameters.writingStyle,
      //     tone: segment.assignedParameters.tone,
      //     personality: segment.assignedParameters.personality,
      //     metrics: metrics,
      //     smtpProviderId: new Types.ObjectId(config.smtpProviderId),
      //   });

      //   // Add this campaign to the list
      //   mockCampaignIds.push(campaign._id as Types.ObjectId);

      //   // Add sample emails to the array for each subscriber
      //   for (const subscriberId of segment.subscriberIds) {
      //     mockEmailsToSave.push({
      //       subscriberId,
      //       subject: campaign.subject,
      //       body: campaign.content,
      //       generatedPrompt: "This is a mock prompt for the generated email",
      //       aiProvider: config.aiProvider,
      //       aiModel:
      //         config.aiProvider === "openai"
      //           ? "gpt-4o-mini"
      //           : "claude-3-7-sonnet-latest",
      //       offerId,
      //       campaignId: campaign._id as Types.ObjectId,
      //       styleParameters: {
      //         copywritingStyle: segment.assignedParameters.copywritingStyle,
      //         writingStyle: segment.assignedParameters.writingStyle,
      //         tone: segment.assignedParameters.tone,
      //         personality: segment.assignedParameters.personality,
      //       },
      //     });
      //   }

      //   // Aggregate metrics
      //   allMetrics.totalSent += metrics.totalSent;
      //   allMetrics.totalOpens += metrics.totalOpens;
      //   allMetrics.totalClicks += metrics.totalClicks;
      //   allMetrics.totalConversions += metrics.totalConversions;
      //   allMetrics.totalRevenue += metrics.totalRevenue;
      // }

      // // Update segment with campaign IDs
      // await SubscriberSegment.findByIdAndUpdate(segmentId, {
      //   campaignIds: mockCampaignIds,
      //   status: SegmentStatus.PROCESSED,
      // });

      // // Save mock emails to optimization round
      // await OptimizationRound.findByIdAndUpdate(segment.optimizationRoundId, {
      //   $push: { emailsSent: { $each: mockEmailsToSave } },
      // });

      // // Log the completion of this segment
      // console.log(
      //   `Completed processing segment ${segment._id} with ${mockCampaignIds.length} campaigns.`,
      //   {
      //     metrics: allMetrics,
      //     campaignIds: mockCampaignIds,
      //   }
      // );
    } catch (error: any) {
      console.error(`Error processing segment ${segmentId}:`, error);
      // Update segment status to failed
      await SubscriberSegment.findByIdAndUpdate(segmentId, {
        status: SegmentStatus.FAILED,
        error: error.message,
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

  /**
   * Sends a notification email when the optimization process is complete
   *
   * @param processId - The ID of the process that completed
   * @param config - The optimization configuration
   */
  private async sendOptimizationCompletionEmail(
    processId: string,
    config: IOptimizationConfig
  ): Promise<void> {
    try {
      // Get the process details
      const process = await CampaignProcess.findById(processId);
      if (!process || process.status !== "completed") {
        return;
      }

      // Get the user
      const user = await User.findById(config.userId);
      if (!user || !user.email) {
        console.error(
          "Cannot send completion email: User not found or has no email"
        );
        return;
      }

      // Get the best parameters from the process results
      const bestParameters = process.result?.bestParameters;
      if (!bestParameters) {
        console.error("No best parameters found in the process results");
        return;
      }

      // Get the subscriber list
      const subscriberList = await SubscriberList.findById(
        config.subscriberListId
      );
      const listName = subscriberList?.name || "Unnamed list";

      // Format the results
      const bestParametersHtml = `
        <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Parameter</th>
            <th>Best Value</th>
          </tr>
          <tr>
            <td>Copywriting Style</td>
            <td>${bestParameters.copywritingStyle}</td>
          </tr>
          <tr>
            <td>Writing Style</td>
            <td>${bestParameters.writingStyle}</td>
          </tr>
          <tr>
            <td>Tone</td>
            <td>${bestParameters.tone}</td>
          </tr>
          <tr>
            <td>Personality</td>
            <td>${bestParameters.personality}</td>
          </tr>
          <tr>
            <td>Conversion Rate</td>
            <td>${(bestParameters.conversionRate * 100).toFixed(2)}%</td>
          </tr>
          <tr>
            <td>Click Rate</td>
            <td>${(bestParameters.clickRate * 100).toFixed(2)}%</td>
          </tr>
        </table>
      `;

      // Format the best-performing emails section
      let bestEmailsHtml = "";

      if (process.result?.bestPerformingEmails?.byConversionRate?.length) {
        bestEmailsHtml += `
          <h3 style="color: #3498db; margin-top: 30px;">Best Performing Emails by Conversion Rate</h3>
          <div style="max-height: 300px; overflow-y: auto; border: 1px solid #eee; padding: 10px; margin-bottom: 20px;">
        `;

        process.result.bestPerformingEmails.byConversionRate.forEach(
          (email) => {
            bestEmailsHtml += `
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <p><strong>Offer:</strong> ${email.offerName}</p>
              <p><strong>Subject:</strong> ${email.subject}</p>
              <p><strong>Conversion Rate:</strong> ${(
                email.conversionRate * 100
              ).toFixed(2)}%</p>
              <p><strong>Style Parameters:</strong> ${
                email.styleParameters.copywritingStyle
              } framework, 
                ${email.styleParameters.writingStyle} writing style, 
                ${email.styleParameters.tone} tone, 
                ${email.styleParameters.personality} personality</p>
              <div style="background-color: #f8f9fa; padding: 10px; border-left: 4px solid #3498db; margin-top: 10px;">
                <strong>Content Preview:</strong>
                <div style="margin-top: 5px;">${email.content.substring(
                  0,
                  150
                )}...</div>
              </div>
            </div>
          `;
          }
        );

        bestEmailsHtml += "</div>";
      }

      if (process.result?.bestPerformingEmails?.byClickRate?.length) {
        bestEmailsHtml += `
          <h3 style="color: #3498db; margin-top: 30px;">Best Performing Emails by Click Rate</h3>
          <div style="max-height: 300px; overflow-y: auto; border: 1px solid #eee; padding: 10px;">
        `;

        process.result.bestPerformingEmails.byClickRate.forEach((email) => {
          bestEmailsHtml += `
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <p><strong>Offer:</strong> ${email.offerName}</p>
              <p><strong>Subject:</strong> ${email.subject}</p>
              <p><strong>Click Rate:</strong> ${(email.clickRate * 100).toFixed(
                2
              )}%</p>
              <p><strong>Style Parameters:</strong> ${
                email.styleParameters.copywritingStyle
              } framework, 
                ${email.styleParameters.writingStyle} writing style, 
                ${email.styleParameters.tone} tone, 
                ${email.styleParameters.personality} personality</p>
              <div style="background-color: #f8f9fa; padding: 10px; border-left: 4px solid #2ecc71; margin-top: 10px;">
                <strong>Content Preview:</strong>
                <div style="margin-top: 5px;">${email.content.substring(
                  0,
                  150
                )}...</div>
              </div>
            </div>
          `;
        });

        bestEmailsHtml += "</div>";
      }

      // Construct email content
      const subject = `Email Optimization Complete: Results for ${listName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Email Optimization Process Complete</h2>
          <p>Your email optimization process for list "${listName}" has been completed successfully.</p>
          
          <h3 style="color: #3498db;">Best Performing Parameters</h3>
          <p>Based on the analysis of ${config.numberOfRounds} optimization rounds, here are the best performing parameters:</p>
          ${bestParametersHtml}
          
          <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745;">
            <p style="margin: 0;"><strong>Recommendation:</strong> For future campaigns targeting this list, consider using these parameters to maximize your email performance.</p>
          </div>
          
          ${bestEmailsHtml}
          
          <p style="margin-top: 20px;">You can view the detailed results in your dashboard.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
            <p>This is an automated notification from Inbox Engine.</p>
          </div>
        </div>
      `;

      // Send email using SmtpService
      await SmtpService.sendEmail({
        providerId: config.smtpProviderId,
        to: user.email,
        subject,
        html: htmlContent,
        senderName: "Inbox Engine",
        senderEmail: config.senderEmail,
      });

      console.log(`Optimization completion email sent to ${user.email}`);
    } catch (error) {
      console.error("Error sending optimization completion email:", error);
    }
  }
}
