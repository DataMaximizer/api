import { Subscriber } from "./models/subscriber.model";
import { logger } from "@config/logger";

export class SubscriberCleanupService {
  static readonly DORMANCY_THRESHOLD_DAYS = 90;
  static readonly LOW_ENGAGEMENT_THRESHOLD = 0.1;
  static readonly BOUNCE_THRESHOLD = 3;

  static async performCleanup() {
    try {
      await Promise.all([
        this.cleanupDormantSubscribers(),
        this.cleanupBouncedEmails(),
        this.updateEngagementScores(),
      ]);
    } catch (error) {
      logger.error("Error during subscriber cleanup:", error);
      throw error;
    }
  }

  static async cleanupDormantSubscribers() {
    const dormancyDate = new Date();
    dormancyDate.setDate(dormancyDate.getDate() - this.DORMANCY_THRESHOLD_DAYS);

    try {
      const result = await Subscriber.updateMany(
        {
          lastInteraction: { $lt: dormancyDate },
          status: "active",
        },
        {
          $set: {
            status: "inactive",
            metadata: {
              $mergeObjects: [
                "$metadata",
                {
                  inactivationReason: "dormancy",
                  inactivationDate: new Date(),
                },
              ],
            },
          },
        },
      );

      logger.info(
        `Marked ${result.modifiedCount} dormant subscribers as inactive`,
      );
    } catch (error) {
      logger.error("Error cleaning up dormant subscribers:", error);
      throw error;
    }
  }

  static async cleanupBouncedEmails() {
    try {
      const result = await Subscriber.updateMany(
        {
          "metrics.bounces": { $gte: this.BOUNCE_THRESHOLD },
          status: { $ne: "bounced" },
        },
        {
          $set: {
            status: "bounced",
            metadata: {
              $mergeObjects: [
                "$metadata",
                {
                  bounceReason: "excessive_bounces",
                  bounceDate: new Date(),
                },
              ],
            },
          },
        },
      );

      logger.info(`Marked ${result.modifiedCount} subscribers as bounced`);
    } catch (error) {
      logger.error("Error cleaning up bounced emails:", error);
      throw error;
    }
  }

  static async updateEngagementScores() {
    try {
      const subscribers = await Subscriber.find({ status: "active" });

      for (const subscriber of subscribers) {
        const engagementScore = this.calculateEngagementScore(subscriber);

        await Subscriber.updateOne(
          { _id: subscriber._id },
          {
            $set: {
              engagementScore,
              lastEngagementUpdate: new Date(),
            },
          },
        );
      }

      logger.info(
        `Updated engagement scores for ${subscribers.length} subscribers`,
      );
    } catch (error) {
      logger.error("Error updating engagement scores:", error);
      throw error;
    }
  }

  private static calculateEngagementScore(subscriber: any): number {
    const {
      metrics: { opens = 0, clicks = 0, conversions = 0 },
      lastInteraction,
    } = subscriber;

    const weights = {
      opens: 1,
      clicks: 2,
      conversions: 3,
      recency: 0.5,
    };

    let score =
      (opens * weights.opens +
        clicks * weights.clicks +
        conversions * weights.conversions) /
      (opens + clicks + conversions || 1);

    // Apply recency factor
    const daysSinceLastInteraction =
      (new Date().getTime() - new Date(lastInteraction).getTime()) /
      (1000 * 60 * 60 * 24);

    const recencyFactor = Math.max(
      0,
      1 - daysSinceLastInteraction / this.DORMANCY_THRESHOLD_DAYS,
    );

    score *= 1 + recencyFactor * weights.recency;

    return Math.min(100, Math.max(0, score));
  }
}
