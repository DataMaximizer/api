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
   * Analyzes the performance of an optimization round
   *
   * @param optimizationRoundId - ID of the round to analyze
   * @returns Best performing parameters and metrics
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
      status: SegmentStatus.PROCESSED,
    });

    if (!segments.length) {
      throw new Error("No processed segments found for this round");
    }

    // Track performance by style combination
    const stylePerformance: IStylePerformance[] = [];

    // Group segments by style combination
    const styleGroups = new Map<string, ISubscriberSegment[]>();

    segments.forEach((segment) => {
      if (!segment.assignedParameters) {
        return;
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

    // Track best performing emails for each offer in this round
    await this.trackBestPerformingEmails(optimizationRound);

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

    // Update the round with the best performing parameters
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
   * Tracks the best performing emails for each offer in a specific round
   *
   * @param optimizationRound - The optimization round to analyze
   */
  private async trackBestPerformingEmails(
    optimizationRound: any
  ): Promise<void> {
    try {
      // Get all segments for this round
      const segments = await SubscriberSegment.find({
        optimizationRoundId: optimizationRound._id,
        status: SegmentStatus.PROCESSED,
      });

      if (!segments.length) {
        console.log("No processed segments found for tracking best emails");
        return;
      }

      // Get all campaigns for these segments
      const allCampaignIds = segments.flatMap((segment) =>
        segment.campaignIds.map((id) => id.toString())
      );

      const campaigns = await Campaign.find({
        _id: { $in: allCampaignIds },
      });

      if (!campaigns.length) {
        console.log("No campaigns found for tracking best emails");
        return;
      }

      // Group campaigns by offer ID to find the best for each offer
      const campaignsByOffer = new Map<string, (typeof Campaign.prototype)[]>();

      // Create a map of campaigns to their segments
      const campaignToSegmentMap = new Map<string, ISubscriberSegment>();

      // Populate the campaign to segment map
      segments.forEach((segment) => {
        segment.campaignIds.forEach((campaignId) => {
          campaignToSegmentMap.set(campaignId.toString(), segment);
        });
      });

      // Group campaigns by offer
      campaigns.forEach((campaign) => {
        if (!campaign.offerId) return;

        const offerId = campaign.offerId.toString();
        if (!campaignsByOffer.has(offerId)) {
          campaignsByOffer.set(offerId, []);
        }

        campaignsByOffer.get(offerId)!.push(campaign);
      });

      // Track best emails by conversion rate and click rate for each offer
      const bestEmailsByConversionRate: Array<{
        offerId: Types.ObjectId;
        offerName: string;
        campaignId: Types.ObjectId;
        subscriberIds: Types.ObjectId[];
        subject: string;
        content: string;
        conversionRate: number;
        styleParameters: {
          copywritingStyle: CopywritingStyle;
          writingStyle: WritingStyle;
          tone: Tone;
          personality: Personality;
        };
      }> = [];

      const bestEmailsByClickRate: Array<{
        offerId: Types.ObjectId;
        offerName: string;
        campaignId: Types.ObjectId;
        subscriberIds: Types.ObjectId[];
        subject: string;
        content: string;
        clickRate: number;
        styleParameters: {
          copywritingStyle: CopywritingStyle;
          writingStyle: WritingStyle;
          tone: Tone;
          personality: Personality;
        };
      }> = [];

      // Find best emails for each offer
      for (const [offerId, offerCampaigns] of campaignsByOffer.entries()) {
        // Get best by conversion rate
        const bestByConversion = offerCampaigns
          .filter(
            (campaign) =>
              campaign.metrics &&
              campaign.metrics.totalClicks > 0 &&
              campaign.metrics.totalSent > 0
          )
          .sort((a, b) => {
            const aConversionRate =
              a.metrics?.totalConversions! / a.metrics?.totalClicks!;
            const bConversionRate =
              b.metrics?.totalConversions! / b.metrics?.totalClicks!;
            return bConversionRate - aConversionRate;
          })[0];

        // Get best by click rate
        const bestByClick = offerCampaigns
          .filter(
            (campaign) => campaign.metrics && campaign.metrics.totalSent > 0
          )
          .sort((a, b) => {
            const aClickRate = a.metrics?.totalClicks! / a.metrics?.totalSent!;
            const bClickRate = b.metrics?.totalClicks! / b.metrics?.totalSent!;
            return bClickRate - aClickRate;
          })[0];

        // Add to best by conversion rate if available
        if (bestByConversion) {
          const segment = campaignToSegmentMap.get(
            bestByConversion._id.toString()
          );

          if (segment && segment.assignedParameters) {
            bestEmailsByConversionRate.push({
              offerId: new Types.ObjectId(offerId),
              offerName: bestByConversion.name || "Unnamed Offer",
              campaignId: bestByConversion._id,
              subscriberIds: bestByConversion.subscriberIds,
              subject: bestByConversion.subject || "",
              content: bestByConversion.content || "",
              conversionRate:
                bestByConversion.metrics?.totalConversions! /
                bestByConversion.metrics?.totalClicks!,
              styleParameters: {
                copywritingStyle: segment.assignedParameters.copywritingStyle,
                writingStyle: segment.assignedParameters.writingStyle,
                tone: segment.assignedParameters.tone,
                personality: segment.assignedParameters.personality,
              },
            });
          }
        }

        // Add to best by click rate if available
        if (bestByClick) {
          const segment = campaignToSegmentMap.get(bestByClick._id.toString());

          if (segment && segment.assignedParameters) {
            bestEmailsByClickRate.push({
              offerId: new Types.ObjectId(offerId),
              offerName: bestByClick.name || "Unnamed Offer",
              campaignId: bestByClick._id,
              subscriberIds: bestByClick.subscriberId,
              subject: bestByClick.subject || "",
              content: bestByClick.content || "",
              clickRate:
                bestByClick.metrics?.totalClicks! /
                bestByClick.metrics?.totalSent!,
              styleParameters: {
                copywritingStyle: segment.assignedParameters.copywritingStyle,
                writingStyle: segment.assignedParameters.writingStyle,
                tone: segment.assignedParameters.tone,
                personality: segment.assignedParameters.personality,
              },
            });
          }
        }
      }

      // Update the optimization round with the best emails
      await OptimizationRound.findByIdAndUpdate(optimizationRound._id, {
        bestPerformingEmails: {
          byConversionRate: bestEmailsByConversionRate,
          byClickRate: bestEmailsByClickRate,
        },
      });

      // Log the number of best emails found
      console.log(
        `Tracked best performing emails for round ${optimizationRound.roundNumber}: ` +
          `${bestEmailsByConversionRate.length} by conversion rate, ${bestEmailsByClickRate.length} by click rate`
      );
    } catch (error) {
      console.error("Error tracking best performing emails:", error);
    }
  }

  /**
   * Checks and updates the global best performing emails at the process completion
   *
   * @param processId - The campaign process ID
   */
  private async updateBestEmailsForProcess(processId: string): Promise<void> {
    try {
      // Get all rounds for this process
      const rounds = await OptimizationRound.find({
        campaignProcessId: new Types.ObjectId(processId),
        status: OptimizationStatus.COMPLETED,
      }).sort({ roundNumber: 1 });

      if (!rounds.length) {
        console.log("No completed rounds found for updating best emails");
        return;
      }

      // Maps to track best emails by offer ID
      const bestByConversionRate = new Map<
        string,
        {
          offerId: Types.ObjectId;
          offerName: string;
          campaignId: Types.ObjectId;
          subject: string;
          content: string;
          conversionRate: number;
          styleParameters: {
            copywritingStyle: CopywritingStyle;
            writingStyle: WritingStyle;
            tone: Tone;
            personality: Personality;
          };
        }
      >();

      const bestByClickRate = new Map<
        string,
        {
          offerId: Types.ObjectId;
          offerName: string;
          campaignId: Types.ObjectId;
          subject: string;
          content: string;
          clickRate: number;
          styleParameters: {
            copywritingStyle: CopywritingStyle;
            writingStyle: WritingStyle;
            tone: Tone;
            personality: Personality;
          };
        }
      >();

      // Iterate through all rounds to find best emails
      for (const round of rounds) {
        if (!round.bestPerformingEmails) continue;

        // Process best by conversion rate
        if (round.bestPerformingEmails.byConversionRate) {
          for (const email of round.bestPerformingEmails.byConversionRate) {
            const offerId = email.offerId.toString();

            // Replace if better or not yet tracked
            if (
              !bestByConversionRate.has(offerId) ||
              bestByConversionRate.get(offerId)!.conversionRate <
                email.conversionRate
            ) {
              bestByConversionRate.set(offerId, email);
            }
          }
        }

        // Process best by click rate
        if (round.bestPerformingEmails.byClickRate) {
          for (const email of round.bestPerformingEmails.byClickRate) {
            const offerId = email.offerId.toString();

            // Replace if better or not yet tracked
            if (
              !bestByClickRate.has(offerId) ||
              bestByClickRate.get(offerId)!.clickRate < email.clickRate
            ) {
              bestByClickRate.set(offerId, email);
            }
          }
        }
      }

      // Convert maps to arrays for update
      const bestConversionEmails = Array.from(bestByConversionRate.values());
      const bestClickEmails = Array.from(bestByClickRate.values());

      // Update the campaign process with the best emails
      await CampaignProcess.findByIdAndUpdate(processId, {
        "result.bestPerformingEmails": {
          byConversionRate: bestConversionEmails,
          byClickRate: bestClickEmails,
        },
      });

      console.log(
        `Updated process ${processId} with best performing emails: ` +
          `${bestConversionEmails.length} by conversion rate, ${bestClickEmails.length} by click rate`
      );
    } catch (error) {
      console.error("Error updating best emails for process:", error);
    }
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
   * Checks if a campaign optimization process is complete and updates its status
   *
   * @param processId - ID of the campaign process
   * @returns true if the process is completed
   */
  public async checkProcessCompletion(processId: string): Promise<boolean> {
    // Get all optimization rounds for this process
    const rounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(processId),
    });

    // Check if all rounds are completed or failed
    const allRoundsComplete = rounds.every(
      (round) =>
        round.status === OptimizationStatus.COMPLETED ||
        round.status === OptimizationStatus.FAILED
    );

    if (allRoundsComplete) {
      // Calculate the best parameters across all rounds
      const completedRounds = rounds.filter(
        (round) => round.status === OptimizationStatus.COMPLETED
      );

      if (completedRounds.length === 0) {
        // All rounds failed, update the process status to failed
        await CampaignProcess.findByIdAndUpdate(processId, {
          status: "failed",
          error: "All optimization rounds failed",
        });

        return false;
      }

      // Find the best parameters across all rounds
      let bestRound = completedRounds[0];
      let highestConversionRate = 0;

      completedRounds.forEach((round) => {
        if (
          round.bestPerformingParameters &&
          round.bestPerformingParameters.conversionRate > highestConversionRate
        ) {
          highestConversionRate = round.bestPerformingParameters.conversionRate;
          bestRound = round;
        }
      });

      // Update the campaign process with the best overall parameters
      await CampaignProcess.findByIdAndUpdate(processId, {
        status: "completed",
        result: {
          bestParameters: bestRound.bestPerformingParameters,
        },
      });

      // Update the best performing emails across all rounds
      await this.updateBestEmailsForProcess(processId);

      console.log(
        `Optimization process ${processId} completed with best parameters:`,
        bestRound.bestPerformingParameters
      );

      return true;
    }

    return false;
  }
}
