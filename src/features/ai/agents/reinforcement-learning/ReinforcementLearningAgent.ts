import { Types } from "mongoose";
import { ConversionAnalysisAgent } from "../conversion-analysis/ConversionAnalysisAgent";
import { OfferSelectionAgent } from "../offer-selection/OfferSelectionAgent";
import { availableRecommendedStyles } from "../writing-style/WritingStyleOptimizationAgent";
import { ReinforcementModel } from "../../models/ReinforcementModel";
import { Campaign } from "@/features/campaign/models/campaign.model";
import { Subscriber } from "@/features/subscriber/models/subscriber.model";
import * as tf from "@tensorflow/tfjs-node";
/**
 * The ReinforcementLearningAgent class implements a continuous optimization cycle.
 * It gathers performance data via the ConversionAnalysisAgent, adjusts internal weights
 * for offer selection, writing style effectiveness, and audience segmentation using a
 * multi-armed bandit approach (exploitation vs exploration). Additionally, it uses a simple
 * TensorFlow.js model to predict future conversion trends.
 */
export class ReinforcementLearningAgent {
  private conversionAgent: ConversionAnalysisAgent;
  private offerSelectionAgent: OfferSelectionAgent;
  private learningRate: number;

  // Internal maps for storing weights.
  private offerWeights: Map<string, number>;
  private writingStyleWeights: Map<string, number>;
  private audienceSegmentWeights: Map<string, number>;

  constructor(learningRate = 0.1) {
    this.conversionAgent = new ConversionAnalysisAgent();
    this.offerSelectionAgent = new OfferSelectionAgent();
    this.learningRate = learningRate;
    this.offerWeights = new Map();
    this.writingStyleWeights = new Map();
    this.audienceSegmentWeights = new Map();

    // Initialize writing style weights with a default value.
    for (const style of availableRecommendedStyles) {
      this.writingStyleWeights.set(style, 0.5);
    }
  }

  /**
   * Runs a full optimization cycle:
   * - Loads persisted weights.
   * - Updates offer, writing style, and audience segment weights.
   * - Detects engagement drops.
   * - Uses TensorFlow.js to predict future trends.
   * - Persists the updated weights.
   */
  public async optimizeStrategies(): Promise<void> {
    await this.loadPersistedWeights();
    await this.updateOfferWeights();
    await this.updateWritingStyleWeights();
    await this.updateAudienceSegmentWeights();
    this.detectEngagementDrops();
    const prediction = await this.predictFutureTrends();
    console.log("Future Trends Prediction:", prediction);
    await this.persistWeights();
  }

  /**
   * Loads persisted weights from the database and converts them from structured arrays to Maps.
   */
  private async loadPersistedWeights(): Promise<void> {
    const storedData = await ReinforcementModel.findOne({});
    if (storedData) {
      const data = storedData.toObject();
      if (data.offerWeights && Array.isArray(data.offerWeights)) {
        this.offerWeights = new Map(
          data.offerWeights.map((entry: { id: string; weight: number }) => [
            entry.id,
            entry.weight,
          ])
        );
      }
      if (data.writingStyleWeights && Array.isArray(data.writingStyleWeights)) {
        this.writingStyleWeights = new Map(
          data.writingStyleWeights.map(
            (entry: { style: string; weight: number }) => [
              entry.style,
              entry.weight,
            ]
          )
        );
      }
      if (
        data.audienceSegmentWeights &&
        Array.isArray(data.audienceSegmentWeights)
      ) {
        this.audienceSegmentWeights = new Map(
          data.audienceSegmentWeights.map(
            (entry: { segment: string; weight: number }) => [
              entry.segment,
              entry.weight,
            ]
          )
        );
      }
      console.log("Loaded persisted weights from ReinforcementModel.");
    } else {
      console.log("No persisted weights found. Using default weights.");
    }
  }

  /**
   * Updates offer weights based on conversion performance.
   */
  private async updateOfferWeights(): Promise<void> {
    const topOffers = await this.conversionAgent.getTopOffersByConversionRate(
      5
    );
    topOffers.forEach((offerData) => {
      const offerId = (offerData.offer._id as Types.ObjectId).toString();
      const currentWeight = this.offerWeights.get(offerId) || 0.5;
      const newWeight =
        currentWeight +
        this.learningRate * (offerData.conversionRate - currentWeight);
      this.offerWeights.set(offerId, newWeight);
      console.log(
        `Updated offer "${offerData.offer.name}" weight to ${newWeight.toFixed(
          3
        )}`
      );
    });
  }

  /**
   * Updates writing style weights by aggregating campaign data.
   */
  private async updateWritingStyleWeights(): Promise<void> {
    const writingStyles = Array.from(this.writingStyleWeights.keys());
    const aggregatedData = await Campaign.aggregate([
      {
        $match: {
          writingStyle: { $in: writingStyles },
          "metrics.totalClicks": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$writingStyle",
          totalClicks: { $sum: "$metrics.totalClicks" },
          totalConversions: { $sum: "$metrics.totalConversions" },
        },
      },
      {
        $project: {
          conversionRate: {
            $cond: [
              { $gt: ["$totalClicks", 0] },
              { $divide: ["$totalConversions", "$totalClicks"] },
              0,
            ],
          },
        },
      },
    ]);

    const stylePerformance = new Map<string, number>();
    aggregatedData.forEach((record) => {
      stylePerformance.set(record._id, record.conversionRate);
    });

    writingStyles.forEach((style) => {
      const aggregatedConversionRate = stylePerformance.get(style) ?? 0.5;
      const currentWeight = this.writingStyleWeights.get(style) ?? 0.5;
      const newWeight =
        currentWeight +
        this.learningRate * (aggregatedConversionRate - currentWeight);
      this.writingStyleWeights.set(style, newWeight);
      console.log(
        `Updated writing style "${style}" weight to ${newWeight.toFixed(
          3
        )} (aggregated conversion rate: ${aggregatedConversionRate.toFixed(3)})`
      );
      if (newWeight < 0.2) {
        console.log(
          `Warning: Writing style "${style}" is underperforming. Consider testing alternative approaches.`
        );
      }
    });
  }

  /**
   * Updates audience segment weights by aggregating subscriber performance data.
   */
  private async updateAudienceSegmentWeights(): Promise<void> {
    const sampleSegments = ["tech-savvy", "budget-conscious", "luxury-seeking"];
    for (const segment of sampleSegments) {
      const result: any[] = await Subscriber.aggregate([
        {
          $match: {
            tags: segment,
            "metrics.clicks": { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalClicks: { $sum: "$metrics.clicks" },
            totalConversions: { $sum: "$metrics.conversions" },
          },
        },
        {
          $project: {
            conversionRate: {
              $cond: [
                { $gt: ["$totalClicks", 0] },
                { $divide: ["$totalConversions", "$totalClicks"] },
                0,
              ],
            },
          },
        },
      ]);
      const aggregatedConversionRate =
        result.length > 0 ? result[0].conversionRate : 0.5;
      const currentWeight = this.audienceSegmentWeights.get(segment) || 0.5;
      const newWeight =
        currentWeight +
        this.learningRate * (aggregatedConversionRate - currentWeight);
      this.audienceSegmentWeights.set(segment, newWeight);
      console.log(
        `Updated audience segment "${segment}" weight to ${newWeight.toFixed(
          3
        )} (aggregated conversion rate: ${aggregatedConversionRate.toFixed(3)})`
      );
    }
  }

  /**
   * Detects engagement drops by checking the average offer weight.
   */
  private detectEngagementDrops(): void {
    const avgOfferWeight =
      Array.from(this.offerWeights.values()).reduce((acc, w) => acc + w, 0) /
      (this.offerWeights.size || 1);
    if (avgOfferWeight < 0.3) {
      console.log(
        "Engagement drop detected. Initiating A/B tests to explore new email formats and strategies."
      );
      // Additional logic to trigger A/B testing can be added here.
    }
  }

  /**
   * Persists the updated weights into the database by converting Maps to structured arrays.
   */
  private async persistWeights(): Promise<void> {
    await ReinforcementModel.findOneAndUpdate(
      {},
      {
        offerWeights: Array.from(this.offerWeights.entries()).map(
          ([id, weight]) => ({ id, weight })
        ),
        writingStyleWeights: Array.from(this.writingStyleWeights.entries()).map(
          ([style, weight]) => ({ style, weight })
        ),
        audienceSegmentWeights: Array.from(
          this.audienceSegmentWeights.entries()
        ).map(([segment, weight]) => ({ segment, weight })),
        lastUpdated: new Date(),
      },
      { upsert: true }
    );
    console.log("Persisted updated weights to ReinforcementModel.");
  }

  /**
   * Builds and trains a TensorFlow.js model using real historical campaign data,
   * then predicts a future conversion rate given the average offer and writing style weights.
   * If insufficient data is available, it will simply skip training and return a default conversion rate.
   *
   * @param avgOfferWeight - The average weight across offers.
   * @param avgWritingStyleWeight - The average weight across writing styles.
   * @returns A predicted conversion rate (between 0 and 1).
   */
  private async predictWithTensorFlow(
    avgOfferWeight: number,
    avgWritingStyleWeight: number
  ): Promise<number> {
    // Query historical campaign data with valid conversion metrics.
    const campaigns = await Campaign.find({
      "metrics.totalClicks": { $gt: 0 },
    }).limit(50);

    const xsData: number[][] = [];
    const ysData: number[][] = [];

    // Build the training dataset from the fetched campaign data.
    campaigns.forEach((campaign) => {
      const offerId = campaign.offerId.toString();
      const offerWeight = this.offerWeights.get(offerId) || 0.5;
      const writingStyle = campaign.writingStyle;
      const writingStyleWeight =
        this.writingStyleWeights.get(writingStyle) || 0.5;
      if (!campaign.metrics) return;
      const { totalClicks, totalConversions } = campaign.metrics;
      if (totalClicks > 0) {
        const conversionRate = totalConversions / totalClicks;
        xsData.push([offerWeight, writingStyleWeight]);
        ysData.push([conversionRate]);
      }
    });

    // If no training data is available, skip model training.
    if (xsData.length === 0) {
      console.log(
        "No historical campaign data available for training. Skipping model training."
      );
      return 0.5;
    }

    // Convert training data to tensors.
    const xsTensor = tf.tensor2d(xsData);
    const ysTensor = tf.tensor2d(ysData);

    // Build a simple sequential model.
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [2], units: 1 }));
    model.compile({ loss: "meanSquaredError", optimizer: "sgd" });

    await model.fit(xsTensor, ysTensor, { epochs: 100, verbose: 0 });

    // Predict using the current average weights.
    const input = tf.tensor2d([[avgOfferWeight, avgWritingStyleWeight]]);
    const predictionTensor = model.predict(input) as tf.Tensor;
    const prediction = (await predictionTensor.data())[0];
    return prediction;
  }

  /**
   * Uses TensorFlow.js to predict future conversion trends based on current weights.
   *
   * @returns A string summary with strategy recommendations.
   */
  public async predictFutureTrends(): Promise<string> {
    const avgOfferWeight =
      Array.from(this.offerWeights.values()).reduce((a, b) => a + b, 0) /
      (this.offerWeights.size || 1);
    const avgWritingStyleWeight =
      Array.from(this.writingStyleWeights.values()).reduce((a, b) => a + b, 0) /
      (this.writingStyleWeights.size || 1);

    const predictedConversionRate = await this.predictWithTensorFlow(
      avgOfferWeight,
      avgWritingStyleWeight
    );
    let trendSummary = `Based on a predicted conversion rate of ${(
      predictedConversionRate * 100
    ).toFixed(1)}%, `;

    if (predictedConversionRate > 0.6) {
      trendSummary +=
        "the future looks very promising for offer performance and writing style effectiveness.";
    } else if (predictedConversionRate < 0.4) {
      trendSummary +=
        "offer performance may be lagging, so consider revisiting your strategy and testing alternative approaches.";
    } else {
      trendSummary += "performance appears stable.";
    }

    return trendSummary;
  }
}
