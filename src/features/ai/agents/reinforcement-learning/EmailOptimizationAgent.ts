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

/**
 * Interface for storing training data for the neural network
 */
interface ITrainingData {
  copywritingStyle: CopywritingStyle;
  writingStyle: WritingStyle;
  tone: Tone;
  personality: Personality;
  metrics: {
    clicks: number;
    conversions: number;
  };
}

/**
 * Interface for tracking style performance metrics
 */
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
  predictedConversionRate?: number;
}

/**
 * Class for storing and calculating statistics for parameter combinations
 */
class StyleStatistics {
  // Maps style key to its performance statistics
  private statistics: Map<
    string,
    {
      totalExperiments: number;
      totalConversionRate: number;
      averageConversionRate: number;
      variance: number;
      samples: number[];
    }
  > = new Map();

  /**
   * Add a new data point for a style combination
   */
  addDataPoint(
    style: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    },
    conversionRate: number
  ): void {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      this.statistics.set(styleKey, {
        totalExperiments: 0,
        totalConversionRate: 0,
        averageConversionRate: 0,
        variance: 0,
        samples: [],
      });
    }

    const stats = this.statistics.get(styleKey)!;

    // Keep track of the previous mean before updating with the new value
    const oldMean = stats.averageConversionRate;

    // Update counts and totals
    stats.totalExperiments += 1;
    stats.totalConversionRate += conversionRate;
    stats.samples.push(conversionRate);

    // Update average
    stats.averageConversionRate =
      stats.totalConversionRate / stats.totalExperiments;

    // Update variance using Welford's online algorithm
    if (stats.samples.length > 1) {
      // M2_n = M2_(n-1) + (x_n - μ_(n-1)) * (x_n - μ_n)
      // where μ_n is the new mean after adding x_n
      const delta = conversionRate - oldMean;
      const delta2 = conversionRate - stats.averageConversionRate;
      stats.variance += delta * delta2;
    }
  }

  /**
   * Get the average conversion rate for a style combination
   */
  getAverageConversionRate(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      // Return a default value for unknown combinations
      return 0.05; // 5% conversion rate as a baseline
    }

    return this.statistics.get(styleKey)!.averageConversionRate;
  }

  /**
   * Get the confidence interval for a style combination
   * Uses UCB1 (Upper Confidence Bound) algorithm for exploration-exploitation balance
   */
  getUCBScore(
    style: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    },
    totalExperiments: number
  ): number {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      // Return a high score for unexplored combinations to encourage exploration
      return 1.0;
    }

    const stats = this.statistics.get(styleKey)!;

    // UCB1 formula: average + C * sqrt(log(total_experiments) / experiments_with_this_arm)
    // C is exploration parameter, typically sqrt(2)
    const explorationParameter = Math.sqrt(2);
    const explorationTerm =
      explorationParameter *
      Math.sqrt(Math.log(totalExperiments) / stats.totalExperiments);

    return stats.averageConversionRate + explorationTerm;
  }

  /**
   * Generate a unique key for a style combination
   */
  private getStyleKey(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): string {
    return `${style.copywritingStyle}|${style.writingStyle}|${style.tone}|${style.personality}`;
  }

  /**
   * Get all style combinations that have data
   */
  getAllStyles(): Array<{
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
    averageConversionRate: number;
    totalExperiments: number;
  }> {
    const result: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      averageConversionRate: number;
      totalExperiments: number;
    }> = [];

    this.statistics.forEach((stats, styleKey) => {
      const [copywritingStyle, writingStyle, tone, personality] =
        styleKey.split("|") as [
          CopywritingStyle,
          WritingStyle,
          Tone,
          Personality
        ];

      result.push({
        copywritingStyle,
        writingStyle,
        tone,
        personality,
        averageConversionRate: stats.averageConversionRate,
        totalExperiments: stats.totalExperiments,
      });
    });

    return result;
  }

  /**
   * Get total number of experiments across all styles
   */
  getTotalExperiments(): number {
    let total = 0;
    this.statistics.forEach((stats) => {
      total += stats.totalExperiments;
    });
    return total;
  }

  /**
   * Get the variance for a style combination
   */
  getVariance(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    const styleKey = this.getStyleKey(style);

    if (
      !this.statistics.has(styleKey) ||
      this.statistics.get(styleKey)!.totalExperiments <= 1
    ) {
      return 0; // No variance with 0 or 1 sample
    }

    const stats = this.statistics.get(styleKey)!;

    // Convert the running sum of squared differences into the sample variance
    // by dividing by n-1 (for unbiased estimation with small sample sizes)
    return stats.variance / (stats.totalExperiments - 1);
  }
}

export class EmailOptimizationAgent {
  private conversionAgent: ConversionAnalysisAgent;
  private explorationRate: number;
  private styleStats = new StyleStatistics();

  // Replace the TensorFlow model with our new statistical model
  private modelTrained: boolean = false;

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

    // If this is not the first round, evaluate the model's predictions
    if (optimizationRound.roundNumber > 1 && this.modelTrained) {
      // Make predictions for all style combinations to see what the model would have predicted
      const predictedPerformance = stylePerformance.map((style) => {
        const predictedRate = this.predictConversionRate({
          copywritingStyle: style.copywritingStyle,
          writingStyle: style.writingStyle,
          tone: style.tone,
          personality: style.personality,
        });

        return {
          ...style,
          predictedConversionRate: predictedRate,
        };
      });

      // Sort by predicted conversion rate
      predictedPerformance.sort(
        (a, b) => b.predictedConversionRate - a.predictedConversionRate
      );

      // Get the style that was predicted to perform best
      const predictedBestStyle = predictedPerformance[0];

      // Calculate prediction error (Mean Absolute Error)
      let totalError = 0;
      let count = 0;

      predictedPerformance.forEach((style) => {
        totalError += Math.abs(
          style.predictedConversionRate - style.conversionRate
        );
        count++;
      });

      const averagePredictionError = count > 0 ? totalError / count : 0;

      // Get the model's accuracy (last training accuracy)
      const modelAccuracy = await this.trainModel(
        optimizationRound.campaignProcessId.toString()
      );

      // Store the model performance metrics
      await OptimizationRound.findByIdAndUpdate(optimizationRoundId, {
        modelPerformance: {
          modelAccuracy,
          predictedTopStyle: {
            copywritingStyle: predictedBestStyle.copywritingStyle,
            writingStyle: predictedBestStyle.writingStyle,
            tone: predictedBestStyle.tone,
            personality: predictedBestStyle.personality,
            predictedConversionRate: predictedBestStyle.predictedConversionRate,
          },
          actualTopStyle: {
            copywritingStyle: bestStyle.copywritingStyle,
            writingStyle: bestStyle.writingStyle,
            tone: bestStyle.tone,
            personality: bestStyle.personality,
            actualConversionRate: bestStyle.conversionRate,
          },
          predictionError: averagePredictionError,
        },
      });

      console.log("Model Performance Metrics:", {
        modelAccuracy,
        predictedBestStyle: {
          style: `${predictedBestStyle.copywritingStyle}/${predictedBestStyle.writingStyle}/${predictedBestStyle.tone}/${predictedBestStyle.personality}`,
          rate: predictedBestStyle.predictedConversionRate,
        },
        actualBestStyle: {
          style: `${bestStyle.copywritingStyle}/${bestStyle.writingStyle}/${bestStyle.tone}/${bestStyle.personality}`,
          rate: bestStyle.conversionRate,
        },
        predictionError: averagePredictionError,
      });
    }

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
   * Trains the statistical model on historical optimization round data
   *
   * @param campaignProcessId - ID of the campaign process
   * @returns The accuracy of the trained model (estimate based on data variance)
   */
  public async trainModel(campaignProcessId: string): Promise<number> {
    console.log(
      `Training statistical model for campaign process ${campaignProcessId}...`
    );

    // Get all completed rounds for this campaign process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      status: OptimizationStatus.COMPLETED,
    }).sort({ roundNumber: 1 });

    if (rounds.length < 1) {
      console.log("Not enough completed rounds to train the model");
      return 0;
    }

    // Get all segments for these rounds
    const segmentIds = rounds.flatMap(
      (round) => round.subscriberSegmentIds || []
    );
    const segments = await SubscriberSegment.find({
      _id: { $in: segmentIds },
      status: SegmentStatus.PROCESSED,
    });

    if (segments.length < 5) {
      console.log("Not enough processed segments to train the model");
      return 0;
    }

    // Reset the style statistics
    this.styleStats = new StyleStatistics();

    // Prepare training data
    segments.forEach((segment) => {
      if (!segment.metrics || segment.metrics.totalSent === 0) {
        return; // Skip segments without metrics
      }

      const conversionRate =
        segment.metrics.totalClicks > 0
          ? segment.metrics.totalConversions / segment.metrics.totalClicks
          : 0;

      // Add data point to our statistical model
      this.styleStats.addDataPoint(
        {
          copywritingStyle: segment.assignedParameters.copywritingStyle,
          writingStyle: segment.assignedParameters.writingStyle,
          tone: segment.assignedParameters.tone,
          personality: segment.assignedParameters.personality,
        },
        conversionRate
      );
    });

    console.log(
      `Trained statistical model with ${this.styleStats.getTotalExperiments()} data points`
    );
    this.modelTrained = true;

    // Calculate a crude accuracy estimate based on data consistency
    // Get all styles and their stats
    const allStyles = this.styleStats.getAllStyles();

    // Calculate average variance across all style combinations
    let totalVariance = 0;
    let styleCount = 0;

    allStyles.forEach((style) => {
      if (style.totalExperiments > 1) {
        // Calculate variance for this style
        const variance = this.styleStats.getVariance({
          copywritingStyle: style.copywritingStyle,
          writingStyle: style.writingStyle,
          tone: style.tone,
          personality: style.personality,
        });

        totalVariance += variance;
        styleCount++;
      }
    });

    // Convert variance to an "accuracy" metric (lower variance = higher accuracy)
    // This is a simplified approach - real accuracy would require test data
    const averageAccuracy =
      allStyles.length > 0 && styleCount > 0
        ? Math.max(0, Math.min(1, 1 - (totalVariance / styleCount) * 10))
        : 0.5; // Default moderate accuracy when no data

    console.log(
      `Calculated model accuracy: ${averageAccuracy.toFixed(
        4
      )} based on ${styleCount} style combinations`
    );

    return averageAccuracy;
  }

  /**
   * Predicts the conversion rate for a given set of style parameters
   * using the trained statistical model
   *
   * @param params - Email style parameters to evaluate
   * @returns Predicted conversion rate (0-1)
   */
  public predictConversionRate(params: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    // Check if model is trained
    if (!this.modelTrained) {
      console.log(
        "No trained model available, returning default conversion rate of 5%"
      );
      return 0.05; // Default value when no model is available
    }

    try {
      // Get UCB score which balances exploitation (using what works) with
      // exploration (trying new things)
      const totalExperiments = this.styleStats.getTotalExperiments();
      const ucbScore = this.styleStats.getUCBScore(params, totalExperiments);

      // Log the prediction for debugging
      const averageRate = this.styleStats.getAverageConversionRate(params);
      console.log(
        `Predicted conversion rate for style [${params.copywritingStyle}/${
          params.writingStyle
        }/${params.tone}/${params.personality}]: ${(averageRate * 100).toFixed(
          2
        )}% (UCB score: ${(ucbScore * 100).toFixed(2)}%)`
      );

      return ucbScore;
    } catch (error) {
      console.error("Error predicting conversion rate:", error);
      return 0.05; // Default value on error
    }
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
