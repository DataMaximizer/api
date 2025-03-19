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
import { CampaignProcess } from "../../models/campaign-process.model";
import { UserService } from "@features/user/user.service";

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
 * Class for storing and calculating Bayesian statistics for parameter combinations
 * Uses Beta distribution as conjugate prior for Bernoulli trials (conversion events)
 */
class BayesianStyleStatistics {
  // Maps style key to its Bayesian parameters
  private statistics: Map<
    string,
    {
      // Beta distribution parameters
      alpha: number; // successes + prior
      beta: number; // failures + prior
      totalTrials: number; // total number of trials
      samples: number[]; // raw conversion rates for diagnostic purposes
    }
  > = new Map();

  // Default prior parameters - slightly optimistic but uninformative
  private readonly DEFAULT_ALPHA = 1; // Prior pseudo-successes
  private readonly DEFAULT_BETA = 19; // Prior pseudo-failures (5% prior mean)

  /**
   * Add a new data point for a style combination
   * @param style The email style parameters
   * @param conversionRate The observed conversion rate (0-1)
   * @param trials The number of trials (clicks) this observation is based on
   */
  addDataPoint(
    style: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    },
    conversionRate: number,
    trials: number
  ): void {
    const styleKey = this.getStyleKey(style);

    // Initialize if this is the first observation
    if (!this.statistics.has(styleKey)) {
      this.statistics.set(styleKey, {
        alpha: this.DEFAULT_ALPHA,
        beta: this.DEFAULT_BETA,
        totalTrials: 0,
        samples: [],
      });
    }

    const stats = this.statistics.get(styleKey)!;

    // Store the raw sample for diagnostic purposes
    stats.samples.push(conversionRate);

    // Calculate successes and failures from the conversion rate and trials
    const successes = conversionRate * trials;
    const failures = trials - successes;

    // Update Beta distribution parameters
    stats.alpha += successes;
    stats.beta += failures;
    stats.totalTrials += trials;
  }

  /**
   * Get the expected (mean) conversion rate for a style combination
   */
  getMeanConversionRate(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      // Return prior mean for unknown combinations
      return this.DEFAULT_ALPHA / (this.DEFAULT_ALPHA + this.DEFAULT_BETA);
    }

    const stats = this.statistics.get(styleKey)!;
    // Mean of Beta distribution is alpha / (alpha + beta)
    return stats.alpha / (stats.alpha + stats.beta);
  }

  /**
   * Get the 95% credible interval for the conversion rate
   */
  getCredibleInterval(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): { lower: number; upper: number } {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      // Return wide interval for unknown combinations
      return { lower: 0.01, upper: 0.15 };
    }

    const stats = this.statistics.get(styleKey)!;

    // We'd normally use a proper quantile function for Beta distribution here
    // But for simplicity, we'll use a normal approximation which is reasonable
    // when alpha and beta are not too small
    const mean = stats.alpha / (stats.alpha + stats.beta);
    const variance =
      (stats.alpha * stats.beta) /
      (Math.pow(stats.alpha + stats.beta, 2) * (stats.alpha + stats.beta + 1));
    const stdDev = Math.sqrt(variance);

    // 95% credible interval (approximately)
    return {
      lower: Math.max(0, mean - 1.96 * stdDev),
      upper: Math.min(1, mean + 1.96 * stdDev),
    };
  }

  /**
   * Get Thompson Sampling score using a simplified approach
   * Balance between exploitation and exploration based on uncertainty
   */
  getThompsonSample(style: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }): number {
    const styleKey = this.getStyleKey(style);

    if (!this.statistics.has(styleKey)) {
      // For unknown combinations, return a random value centered around prior mean
      const priorMean =
        this.DEFAULT_ALPHA / (this.DEFAULT_ALPHA + this.DEFAULT_BETA);
      return Math.max(0, Math.min(1, priorMean + (Math.random() - 0.5) * 0.2));
    }

    const stats = this.statistics.get(styleKey)!;
    const mean = stats.alpha / (stats.alpha + stats.beta);

    // Calculate standard deviation
    const variance =
      (stats.alpha * stats.beta) /
      (Math.pow(stats.alpha + stats.beta, 2) * (stats.alpha + stats.beta + 1));
    const stdDev = Math.sqrt(variance);

    // Sample from approximate normal distribution with mean and stdDev
    // This approximates a sample from the Beta distribution
    const randomOffset = (Math.random() * 2 - 1) * stdDev * 2;

    // Clamp to valid range [0, 1]
    return Math.max(0, Math.min(1, mean + randomOffset));
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
    meanConversionRate: number;
    credibleInterval: { lower: number; upper: number };
    totalTrials: number;
  }> {
    const result: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      meanConversionRate: number;
      credibleInterval: { lower: number; upper: number };
      totalTrials: number;
    }> = [];

    this.statistics.forEach((stats, styleKey) => {
      const [copywritingStyle, writingStyle, tone, personality] =
        styleKey.split("|") as [
          CopywritingStyle,
          WritingStyle,
          Tone,
          Personality
        ];

      const meanConversionRate = stats.alpha / (stats.alpha + stats.beta);
      const variance =
        (stats.alpha * stats.beta) /
        (Math.pow(stats.alpha + stats.beta, 2) *
          (stats.alpha + stats.beta + 1));
      const stdDev = Math.sqrt(variance);

      result.push({
        copywritingStyle,
        writingStyle,
        tone,
        personality,
        meanConversionRate,
        credibleInterval: {
          lower: Math.max(0, meanConversionRate - 1.96 * stdDev),
          upper: Math.min(1, meanConversionRate + 1.96 * stdDev),
        },
        totalTrials: stats.totalTrials,
      });
    });

    return result;
  }

  /**
   * Get total number of trials across all styles
   */
  getTotalTrials(): number {
    let total = 0;
    this.statistics.forEach((stats) => {
      total += stats.totalTrials;
    });
    return total;
  }
}

export class EmailOptimizationAgent {
  private conversionAgent: ConversionAnalysisAgent;
  private explorationRate: number;
  private styleStats = new BayesianStyleStatistics();

  // Replace the TensorFlow model with our new statistical model
  private modelTrained: boolean = false;
  private instanceId: string;

  constructor(explorationRate = 0.2) {
    this.conversionAgent = new ConversionAnalysisAgent();
    this.explorationRate = explorationRate;
    this.instanceId = Math.random().toString(36).substring(2, 9);
    console.log(
      `Created EmailOptimizationAgent instance with ID: ${this.instanceId}`
    );
  }

  /**
   * Analyzes the performance of a completed optimization round and determines
   * the best performing parameters for the next round using Bayesian statistics
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

    // If this is not the first round and model is trained, evaluate the model's predictions
    if (optimizationRound.roundNumber > 1 && this.modelTrained) {
      // Make Bayesian predictions for all style combinations to see what the model would have predicted
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
        (a, b) => b.predictedConversionRate! - a.predictedConversionRate!
      );

      // Get the style that was predicted to perform best
      const predictedBestStyle = predictedPerformance[0];

      // Calculate prediction error (Mean Absolute Error)
      let totalError = 0;
      let count = 0;

      predictedPerformance.forEach((style) => {
        totalError += Math.abs(
          style.predictedConversionRate! - style.conversionRate
        );
        count++;
      });

      const averagePredictionError = count > 0 ? totalError / count : 0;

      // Get the model's accuracy from training
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

      // Log Bayesian model performance metrics
      console.log("Bayesian Model Performance Metrics:", {
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
        predictionSuccessRate:
          predictedBestStyle.copywritingStyle === bestStyle.copywritingStyle &&
          predictedBestStyle.writingStyle === bestStyle.writingStyle &&
          predictedBestStyle.tone === bestStyle.tone &&
          predictedBestStyle.personality === bestStyle.personality
            ? "Correctly predicted best style"
            : "Did not predict best style correctly",
      });

      // Get credible intervals for the top styles
      const bestStyleCredibleInterval = this.styleStats.getCredibleInterval({
        copywritingStyle: bestStyle.copywritingStyle,
        writingStyle: bestStyle.writingStyle,
        tone: bestStyle.tone,
        personality: bestStyle.personality,
      });

      console.log(
        `Best style 95% credible interval: [${(
          bestStyleCredibleInterval.lower * 100
        ).toFixed(2)}% - ${(bestStyleCredibleInterval.upper * 100).toFixed(
          2
        )}%]`
      );
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
      // Add aggregated metrics from all segments in the round
      metrics: {
        totalSent: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalSent || 0),
          0
        ),
        totalOpens: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalOpens || 0),
          0
        ),
        totalClicks: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalClicks || 0),
          0
        ),
        totalConversions: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalConversions || 0),
          0
        ),
        totalRevenue: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalRevenue || 0),
          0
        ),
      },
      status: OptimizationStatus.COMPLETED,
      endDate: new Date(),
    });

    // Log the aggregated metrics for the round
    console.log(
      `Aggregated metrics for round ${optimizationRound.roundNumber}:`,
      {
        totalSent: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalSent || 0),
          0
        ),
        totalOpens: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalOpens || 0),
          0
        ),
        totalClicks: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalClicks || 0),
          0
        ),
        totalConversions: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalConversions || 0),
          0
        ),
        totalRevenue: segments.reduce(
          (sum, segment) => sum + (segment.metrics?.totalRevenue || 0),
          0
        ),
      }
    );

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
   * Trains a Bayesian statistical model to predict conversion rates based on style parameters
   *
   * @param campaignProcessId - ID of the campaign process
   * @returns Training accuracy approximation
   */
  public async trainModel(campaignProcessId: string): Promise<number> {
    console.log(
      `[Agent: ${this.instanceId}] Training Bayesian model for campaign process ${campaignProcessId}...`
    );

    // Get all completed optimization rounds for this process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      status: OptimizationStatus.COMPLETED,
    }).sort({ roundNumber: 1 });

    if (rounds.length < 1) {
      console.log(
        `[Agent: ${this.instanceId}] Not enough completed rounds to train the model`
      );
      return 0;
    }

    // Get all segments with metrics
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
    this.styleStats = new BayesianStyleStatistics();

    // Prepare training data
    let totalError = 0;
    let totalPoints = 0;

    // Process each segment's data
    segments.forEach((segment) => {
      if (!segment.metrics || segment.metrics.totalClicks === 0) {
        return; // Skip segments without metrics or clicks
      }

      // Calculate conversion rate
      const conversionRate =
        segment.metrics.totalConversions / segment.metrics.totalClicks;

      // Add data point to our Bayesian model
      this.styleStats.addDataPoint(
        {
          copywritingStyle: segment.assignedParameters.copywritingStyle,
          writingStyle: segment.assignedParameters.writingStyle,
          tone: segment.assignedParameters.tone,
          personality: segment.assignedParameters.personality,
        },
        conversionRate,
        segment.metrics.totalClicks // Number of trials (clicks)
      );

      // After adding the point, check the prediction accuracy
      const predictedRate = this.styleStats.getMeanConversionRate({
        copywritingStyle: segment.assignedParameters.copywritingStyle,
        writingStyle: segment.assignedParameters.writingStyle,
        tone: segment.assignedParameters.tone,
        personality: segment.assignedParameters.personality,
      });

      // Calculate error (absolute difference)
      const error = Math.abs(predictedRate - conversionRate);
      totalError += error;
      totalPoints++;
    });

    // Calculate mean absolute error if we have data points
    const meanAbsoluteError = totalPoints > 0 ? totalError / totalPoints : 0;

    // Convert error to "accuracy" approximation (1 - normalized error)
    // This is not a true accuracy but provides a metric comparable to the neural network
    const accuracyApproximation = Math.max(0, 1 - meanAbsoluteError / 0.1); // Normalizing by 0.1

    console.log(
      `[Agent: ${
        this.instanceId
      }] Trained Bayesian model with ${this.styleStats.getTotalTrials()} trials from ${totalPoints} segments`
    );
    console.log(
      `[Agent: ${
        this.instanceId
      }] Model performance - Mean Absolute Error: ${meanAbsoluteError.toFixed(
        4
      )}, Accuracy approximation: ${accuracyApproximation.toFixed(4)}`
    );

    this.modelTrained = true;
    console.log(
      `[Agent: ${this.instanceId}] Model trained flag set to: ${this.modelTrained}`
    );

    return accuracyApproximation;
  }

  /**
   * Predicts the conversion rate for a given set of style parameters
   * using the Bayesian model
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
    // If model isn't trained, return default value
    if (!this.modelTrained) {
      console.log(
        `[Agent: ${this.instanceId}] No trained model available, returning default conversion rate of 5%`
      );
      return 0.05; // Default value when no model is available
    }

    try {
      // Get Thompson Sampling score which balances exploration/exploitation
      const thompsonSample = this.styleStats.getThompsonSample(params);

      // Get the mean prediction and credible interval for logging
      const meanRate = this.styleStats.getMeanConversionRate(params);
      const credibleInterval = this.styleStats.getCredibleInterval(params);

      console.log(
        `[Agent: ${this.instanceId}] Bayesian prediction for style [${
          params.copywritingStyle
        }/${params.writingStyle}/${params.tone}/${params.personality}]:
         Mean: ${(meanRate * 100).toFixed(2)}% 
         95% Credible Interval: [${(credibleInterval.lower * 100).toFixed(
           2
         )}% - ${(credibleInterval.upper * 100).toFixed(2)}%]
         Thompson Sampling: ${(thompsonSample * 100).toFixed(2)}%`
      );

      // Return the Thompson Sampling result which naturally balances exploration vs exploitation
      return thompsonSample;
    } catch (error) {
      console.error(
        `[Agent: ${this.instanceId}] Error predicting conversion rate:`,
        error
      );
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
        
        <p>Thank you for using Inbox Engine!</p>
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
