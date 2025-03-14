import { Types } from "mongoose";
import { ConversionAnalysisAgent } from "../conversion-analysis/ConversionAnalysisAgent";
import { Campaign } from "@features/campaign/models/campaign.model";
import {
  SubscriberSegment,
  SegmentStatus,
  ISubscriberSegment,
} from "../../models/subscriber-segment.model";
import {
  OptimizationRound,
  OptimizationStatus,
} from "../../models/optimization-round.model";
import {
  CopywritingStyle,
  WritingStyle,
  Tone,
  Personality,
} from "../offer-selection/OfferSelectionAgent";
import * as tf from "@tensorflow/tfjs-node";
import { CampaignProcess } from "../../models/campaign-process.model";
import { UserService } from "@features/user/user.service";

interface IStylePerformance {
  copywritingStyle: CopywritingStyle;
  writingStyle: WritingStyle;
  tone: Tone;
  personality: Personality;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  revenuePerEmail: number;
}

export class EmailOptimizationAgent {
  private conversionAgent: ConversionAnalysisAgent;
  private explorationRate: number;
  private model: tf.Sequential | null = null;

  constructor(explorationRate = 0.2) {
    this.conversionAgent = new ConversionAnalysisAgent();
    this.explorationRate = explorationRate;
  }

  /**
   * Analyzes the performance of a completed optimization round and determines
   * the best performing parameters for the next round
   *
   * @param optimizationRoundId - ID of the completed optimization round
   * @returns The best performing parameters and metrics
   */
  public async analyzeRoundPerformance(optimizationRoundId: string): Promise<{
    bestParameters: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    };
    metrics: {
      conversionRate: number;
      clickRate: number;
      openRate: number;
      revenuePerEmail: number;
    };
  }> {
    // Get the optimization round
    const optimizationRound = await OptimizationRound.findById(
      optimizationRoundId
    );
    if (!optimizationRound) {
      throw new Error("Optimization round not found");
    }

    // Get all segments for this round
    const segments = await SubscriberSegment.find({
      optimizationRoundId: new Types.ObjectId(optimizationRoundId),
    });

    if (!segments.length) {
      throw new Error("No segments found for this optimization round");
    }

    // Calculate performance for each style combination
    const stylePerformance: IStylePerformance[] = [];

    // Group segments by style combination
    const styleGroups = new Map<string, ISubscriberSegment[]>();

    segments.forEach((segment) => {
      if (segment.status !== SegmentStatus.PROCESSED) {
        return; // Skip segments that weren't processed
      }

      const styleKey = JSON.stringify({
        copywritingStyle: segment.assignedParameters.copywritingStyle,
        writingStyle: segment.assignedParameters.writingStyle,
        tone: segment.assignedParameters.tone,
        personality: segment.assignedParameters.personality,
      });

      if (!styleGroups.has(styleKey)) {
        styleGroups.set(styleKey, []);
      }

      styleGroups.get(styleKey)!.push(segment);
    });

    // Calculate aggregated metrics for each style combination
    for (const [styleKey, segmentsWithStyle] of styleGroups.entries()) {
      const style = JSON.parse(styleKey);

      // Skip if no segments with this style were processed
      if (segmentsWithStyle.length === 0) {
        continue;
      }

      // Aggregate metrics
      const aggregatedMetrics = {
        totalSent: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
      };

      segmentsWithStyle.forEach((segment) => {
        if (segment.metrics) {
          aggregatedMetrics.totalSent += segment.metrics.totalSent || 0;
          aggregatedMetrics.totalOpens += segment.metrics.totalOpens || 0;
          aggregatedMetrics.totalClicks += segment.metrics.totalClicks || 0;
          aggregatedMetrics.totalConversions +=
            segment.metrics.totalConversions || 0;
          aggregatedMetrics.totalRevenue += segment.metrics.totalRevenue || 0;
        }
      });

      // Calculate rates
      const openRate =
        aggregatedMetrics.totalSent > 0
          ? aggregatedMetrics.totalOpens / aggregatedMetrics.totalSent
          : 0;

      const clickRate =
        aggregatedMetrics.totalSent > 0
          ? aggregatedMetrics.totalClicks / aggregatedMetrics.totalSent
          : 0;

      const conversionRate =
        aggregatedMetrics.totalClicks > 0
          ? aggregatedMetrics.totalConversions / aggregatedMetrics.totalClicks
          : 0;

      const revenuePerEmail =
        aggregatedMetrics.totalSent > 0
          ? aggregatedMetrics.totalRevenue / aggregatedMetrics.totalSent
          : 0;

      stylePerformance.push({
        copywritingStyle: style.copywritingStyle,
        writingStyle: style.writingStyle,
        tone: style.tone,
        personality: style.personality,
        ...aggregatedMetrics,
        openRate,
        clickRate,
        conversionRate,
        revenuePerEmail,
      });
    }

    // Sort by conversion rate (primary metric)
    stylePerformance.sort((a, b) => b.conversionRate - a.conversionRate);

    // If no styles performed well, return a default
    if (stylePerformance.length === 0) {
      return {
        bestParameters: {
          copywritingStyle: "AIDA",
          writingStyle: "conversational",
          tone: "professional",
          personality: "confident",
        },
        metrics: {
          conversionRate: 0,
          clickRate: 0,
          openRate: 0,
          revenuePerEmail: 0,
        },
      };
    }

    // Get the best performing style
    const bestStyle = stylePerformance[0];

    // Update the optimization round with the best parameters
    await OptimizationRound.findByIdAndUpdate(optimizationRoundId, {
      bestPerformingParameters: {
        copywritingStyle: bestStyle.copywritingStyle,
        writingStyle: bestStyle.writingStyle,
        tone: bestStyle.tone,
        personality: bestStyle.personality,
        conversionRate: bestStyle.conversionRate,
        clickRate: bestStyle.clickRate,
      },
      status: OptimizationStatus.COMPLETED,
      endDate: new Date(),
    });

    return {
      bestParameters: {
        copywritingStyle: bestStyle.copywritingStyle,
        writingStyle: bestStyle.writingStyle,
        tone: bestStyle.tone,
        personality: bestStyle.personality,
      },
      metrics: {
        conversionRate: bestStyle.conversionRate,
        clickRate: bestStyle.clickRate,
        openRate: bestStyle.openRate,
        revenuePerEmail: bestStyle.revenuePerEmail,
      },
    };
  }

  /**
   * Updates segment metrics based on campaign performance
   *
   * @param segmentId - ID of the segment to update
   * @returns Updated segment metrics
   */
  public async updateSegmentMetrics(segmentId: string): Promise<{
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    clickRate: number;
    conversionRate: number;
  }> {
    // Get the segment
    const segment = await SubscriberSegment.findById(segmentId);
    if (!segment) {
      throw new Error("Segment not found");
    }

    // Get all campaigns for this segment
    const campaigns = await Campaign.find({
      _id: { $in: segment.campaignIds },
    });

    if (!campaigns.length) {
      throw new Error("No campaigns found for this segment");
    }

    // Aggregate metrics from all campaigns
    const metrics = {
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalRevenue: 0,
    };

    campaigns.forEach((campaign) => {
      if (campaign.metrics) {
        metrics.totalSent += campaign.metrics.totalSent || 0;
        metrics.totalOpens += campaign.metrics.totalOpens || 0;
        metrics.totalClicks += campaign.metrics.totalClicks || 0;
        metrics.totalConversions += campaign.metrics.totalConversions || 0;
        metrics.totalRevenue += campaign.metrics.totalRevenue || 0;
      }
    });

    // Calculate rates
    const clickRate =
      metrics.totalSent > 0 ? metrics.totalClicks / metrics.totalSent : 0;

    const conversionRate =
      metrics.totalClicks > 0
        ? metrics.totalConversions / metrics.totalClicks
        : 0;

    // Update segment metrics
    await SubscriberSegment.findByIdAndUpdate(segmentId, {
      metrics: {
        ...metrics,
        clickRate,
        conversionRate,
      },
      status: SegmentStatus.PROCESSED,
    });

    return {
      ...metrics,
      clickRate,
      conversionRate,
    };
  }

  /**
   * Trains a TensorFlow.js model to predict conversion rates based on style parameters
   *
   * @param campaignProcessId - ID of the campaign process
   * @returns Training accuracy
   */
  public async trainModel(campaignProcessId: string): Promise<number> {
    // Get all completed optimization rounds for this process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      status: OptimizationStatus.COMPLETED,
    });

    if (rounds.length < 2) {
      // Not enough data to train a model
      return 0;
    }

    // Get all segments with metrics
    const segments = await SubscriberSegment.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      status: SegmentStatus.PROCESSED,
    });

    if (segments.length < 5) {
      // Not enough data to train a model
      return 0;
    }

    // Prepare training data
    const trainingData: {
      input: number[];
      output: number;
    }[] = [];

    // Define style mappings for one-hot encoding
    const copywritingStyles: CopywritingStyle[] = [
      "AIDA",
      "PAS",
      "BAB",
      "PPP",
      "FAB",
      "QUEST",
    ];
    const writingStyles: WritingStyle[] = [
      "descriptive",
      "narrative",
      "persuasive",
      "expository",
      "conversational",
      "direct",
    ];
    const tones: Tone[] = [
      "professional",
      "friendly",
      "enthusiastic",
      "urgent",
      "empathetic",
      "authoritative",
      "casual",
    ];
    const personalities: Personality[] = [
      "confident",
      "humorous",
      "analytical",
      "caring",
      "adventurous",
      "innovative",
      "trustworthy",
    ];

    segments.forEach((segment) => {
      if (!segment.metrics || segment.metrics.totalSent === 0) {
        return; // Skip segments without metrics
      }

      // One-hot encode the style parameters
      const copywritingStyleIndex = copywritingStyles.indexOf(
        segment.assignedParameters.copywritingStyle
      );
      const writingStyleIndex = writingStyles.indexOf(
        segment.assignedParameters.writingStyle
      );
      const toneIndex = tones.indexOf(segment.assignedParameters.tone);
      const personalityIndex = personalities.indexOf(
        segment.assignedParameters.personality
      );

      // Create one-hot encoded vectors
      const copywritingStyleVector = Array(copywritingStyles.length).fill(0);
      copywritingStyleVector[copywritingStyleIndex] = 1;

      const writingStyleVector = Array(writingStyles.length).fill(0);
      writingStyleVector[writingStyleIndex] = 1;

      const toneVector = Array(tones.length).fill(0);
      toneVector[toneIndex] = 1;

      const personalityVector = Array(personalities.length).fill(0);
      personalityVector[personalityIndex] = 1;

      // Combine all vectors into a single input vector
      const inputVector = [
        ...copywritingStyleVector,
        ...writingStyleVector,
        ...toneVector,
        ...personalityVector,
      ];

      // Use conversion rate as the output
      const conversionRate = segment.metrics.conversionRate || 0;

      trainingData.push({
        input: inputVector,
        output: conversionRate,
      });
    });

    if (trainingData.length < 5) {
      // Not enough data to train a model
      return 0;
    }

    // Create and train the model
    this.model = tf.sequential();

    // Input layer size is the sum of all one-hot encoded vectors
    const inputSize =
      copywritingStyles.length +
      writingStyles.length +
      tones.length +
      personalities.length;

    // Add layers
    this.model.add(
      tf.layers.dense({
        units: 16,
        activation: "relu",
        inputShape: [inputSize],
      })
    );

    this.model.add(
      tf.layers.dense({
        units: 8,
        activation: "relu",
      })
    );

    this.model.add(
      tf.layers.dense({
        units: 1,
        activation: "sigmoid", // For conversion rate (0-1)
      })
    );

    // Compile the model
    this.model.compile({
      optimizer: tf.train.adam(0.01),
      loss: "meanSquaredError",
      metrics: ["accuracy"],
    });

    // Prepare tensors
    const xs = tf.tensor2d(trainingData.map((d) => d.input));
    const ys = tf.tensor2d(trainingData.map((d) => [d.output]));

    // Train the model
    const history = await this.model.fit(xs, ys, {
      epochs: 100,
      batchSize: 4,
      validationSplit: 0.2,
    });

    // Clean up tensors
    xs.dispose();
    ys.dispose();

    // Return the final accuracy
    const finalAccuracy = history.history.acc
      ? history.history.acc[history.history.acc.length - 1]
      : 0;

    return finalAccuracy as number;
  }

  /**
   * Predicts the conversion rate for a given style combination
   *
   * @param style - Style parameters to predict for
   * @returns Predicted conversion rate
   */
  public predictConversionRate(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    if (!this.model) {
      // No model trained, return a default value
      return 0.05; // 5% conversion rate as default
    }

    // Define style mappings for one-hot encoding (must match training)
    const copywritingStyles: CopywritingStyle[] = [
      "AIDA",
      "PAS",
      "BAB",
      "PPP",
      "FAB",
      "QUEST",
    ];
    const writingStyles: WritingStyle[] = [
      "descriptive",
      "narrative",
      "persuasive",
      "expository",
      "conversational",
      "direct",
    ];
    const tones: Tone[] = [
      "professional",
      "friendly",
      "enthusiastic",
      "urgent",
      "empathetic",
      "authoritative",
      "casual",
    ];
    const personalities: Personality[] = [
      "confident",
      "humorous",
      "analytical",
      "caring",
      "adventurous",
      "innovative",
      "trustworthy",
    ];

    // One-hot encode the style parameters
    const copywritingStyleIndex = copywritingStyles.indexOf(
      style.copywritingStyle
    );
    const writingStyleIndex = writingStyles.indexOf(style.writingStyle);
    const toneIndex = tones.indexOf(style.tone);
    const personalityIndex = personalities.indexOf(style.personality);

    // Create one-hot encoded vectors
    const copywritingStyleVector = Array(copywritingStyles.length).fill(0);
    copywritingStyleVector[copywritingStyleIndex] = 1;

    const writingStyleVector = Array(writingStyles.length).fill(0);
    writingStyleVector[writingStyleIndex] = 1;

    const toneVector = Array(tones.length).fill(0);
    toneVector[toneIndex] = 1;

    const personalityVector = Array(personalities.length).fill(0);
    personalityVector[personalityIndex] = 1;

    // Combine all vectors into a single input vector
    const inputVector = [
      ...copywritingStyleVector,
      ...writingStyleVector,
      ...toneVector,
      ...personalityVector,
    ];

    // Make prediction
    const inputTensor = tf.tensor2d([inputVector]);
    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const predictionValue = prediction.dataSync()[0];

    // Clean up tensors
    inputTensor.dispose();
    prediction.dispose();

    return predictionValue;
  }

  /**
   * Checks if the optimization process is complete and notifies the user
   *
   * @param campaignProcessId - ID of the campaign process
   * @returns Whether the process is complete
   */
  public async checkProcessCompletion(
    campaignProcessId: string
  ): Promise<boolean> {
    // Get the campaign process
    const campaignProcess = await CampaignProcess.findById(campaignProcessId);
    if (!campaignProcess) {
      throw new Error("Campaign process not found");
    }

    // Get all optimization rounds for this process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
    });

    // Check if all rounds are completed
    const allCompleted = rounds.every(
      (round) =>
        round.status === OptimizationStatus.COMPLETED ||
        round.status === OptimizationStatus.FAILED
    );

    if (allCompleted && !campaignProcess.notified) {
      // Get the best performing parameters from all rounds
      const completedRounds = rounds.filter(
        (round) =>
          round.status === OptimizationStatus.COMPLETED &&
          round.bestPerformingParameters
      );

      if (completedRounds.length > 0) {
        // Sort by conversion rate
        completedRounds.sort(
          (a, b) =>
            (b.bestPerformingParameters?.conversionRate || 0) -
            (a.bestPerformingParameters?.conversionRate || 0)
        );

        // Get the overall best parameters
        const bestRound = completedRounds[0];
        const bestParameters = bestRound.bestPerformingParameters;

        // Update the campaign process with the results
        await CampaignProcess.findByIdAndUpdate(campaignProcessId, {
          status: "completed",
          result: {
            bestParameters,
            totalRounds: rounds.length,
            completedRounds: completedRounds.length,
            bestRoundNumber: bestRound.roundNumber,
          },
          notified: true,
        });

        // Send notification email to the user
        await this.sendCompletionEmail(
          campaignProcess.userId.toString(),
          campaignProcessId,
          bestParameters!,
          rounds.length,
          completedRounds.length
        );
      } else {
        // No successful rounds
        await CampaignProcess.findByIdAndUpdate(campaignProcessId, {
          status: "failed",
          error: "No successful optimization rounds completed",
          notified: true,
        });

        // Send failure notification
        await this.sendFailureEmail(
          campaignProcess.userId.toString(),
          campaignProcessId
        );
      }

      return true;
    }

    return allCompleted;
  }

  /**
   * Sends a completion email to the user
   *
   * @param userId - User ID
   * @param campaignProcessId - Campaign process ID
   * @param bestParameters - Best performing parameters
   * @param totalRounds - Total number of rounds
   * @param completedRounds - Number of completed rounds
   */
  private async sendCompletionEmail(
    userId: string,
    campaignProcessId: string,
    bestParameters: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      conversionRate: number;
      clickRate: number;
    },
    totalRounds: number,
    completedRounds: number
  ): Promise<void> {
    try {
      // Get user email
      const user = await UserService.getUserById(userId);
      if (!user || !user.email) {
        console.error("User not found or has no email");
        return;
      }

      // Format conversion rate and click rate as percentages
      const conversionRatePercent = (
        bestParameters.conversionRate * 100
      ).toFixed(2);
      const clickRatePercent = (bestParameters.clickRate * 100).toFixed(2);

      // Prepare email content
      const subject = "Email Optimization Process Completed";
      const content = `
        <h2>Email Optimization Process Completed</h2>
        <p>Your email optimization process has been completed successfully.</p>
        
        <h3>Best Performing Parameters:</h3>
        <ul>
          <li><strong>Copywriting Framework:</strong> ${bestParameters.copywritingStyle}</li>
          <li><strong>Writing Style:</strong> ${bestParameters.writingStyle}</li>
          <li><strong>Tone:</strong> ${bestParameters.tone}</li>
          <li><strong>Personality:</strong> ${bestParameters.personality}</li>
        </ul>
        
        <h3>Performance Metrics:</h3>
        <ul>
          <li><strong>Conversion Rate:</strong> ${conversionRatePercent}%</li>
          <li><strong>Click Rate:</strong> ${clickRatePercent}%</li>
        </ul>
        
        <p>Completed ${completedRounds} out of ${totalRounds} optimization rounds.</p>
        
        <p>These parameters have been saved and will be used as the default for your future campaigns.</p>
        
        <p>Thank you for using our Email Optimization service!</p>
      `;

      // Send the email using nodemailer directly (since we removed EmailService)
      const nodemailer = require("nodemailer");
      const smtpHost = process.env.SMTP_HOST || "smtp.example.com";
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpUser = process.env.SMTP_USER || "user@example.com";
      const smtpPass = process.env.SMTP_PASS || "password";
      const defaultFrom = process.env.SMTP_FROM || "noreply@example.com";

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: defaultFrom,
        to: user.email,
        subject,
        html: content,
      });
    } catch (error) {
      console.error("Error sending completion email:", error);
    }
  }

  /**
   * Sends a failure email to the user
   *
   * @param userId - User ID
   * @param campaignProcessId - Campaign process ID
   */
  private async sendFailureEmail(
    userId: string,
    campaignProcessId: string
  ): Promise<void> {
    try {
      // Get user email
      const user = await UserService.getUserById(userId);
      if (!user || !user.email) {
        console.error("User not found or has no email");
        return;
      }

      // Prepare email content
      const subject = "Email Optimization Process Failed";
      const content = `
        <h2>Email Optimization Process Failed</h2>
        <p>Unfortunately, your email optimization process could not be completed successfully.</p>
        
        <p>This could be due to insufficient data or technical issues. Please try again with a larger subscriber segment or contact support if the issue persists.</p>
        
        <p>Thank you for using our Email Optimization service!</p>
      `;

      // Send the email using nodemailer directly
      const nodemailer = require("nodemailer");
      const smtpHost = process.env.SMTP_HOST || "smtp.example.com";
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpUser = process.env.SMTP_USER || "user@example.com";
      const smtpPass = process.env.SMTP_PASS || "password";
      const defaultFrom = process.env.SMTP_FROM || "noreply@example.com";

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: defaultFrom,
        to: user.email,
        subject,
        html: content,
      });
    } catch (error) {
      console.error("Error sending failure email:", error);
    }
  }
}
