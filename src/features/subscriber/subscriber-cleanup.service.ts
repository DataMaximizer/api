import { ISubscriber, Subscriber } from "./models/subscriber.model";
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
        }
      );

      logger.info(
        `Marked ${result.modifiedCount} dormant subscribers as inactive`
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
        }
      );

      logger.info(`Marked ${result.modifiedCount} subscribers as bounced`);
    } catch (error) {
      logger.error("Error cleaning up bounced emails:", error);
      throw error;
    }
  }

  static async updateEngagementScores(targetSubscriberId?: string) {
    try {
      const doUpdate = async (subscriber: ISubscriber) => {
        const engagementScore = this.calculateEngagementScore(subscriber);

        await Subscriber.updateOne(
          { _id: subscriber._id },
          {
            $set: {
              engagementScore,
              lastEngagementUpdate: new Date(),
            },
          }
        );
      };

      if (targetSubscriberId) {
        const subscriber = await Subscriber.findById(targetSubscriberId);
        if (subscriber) {
          await doUpdate(subscriber);
        }
      } else {
        const subscribers = await Subscriber.find({ status: "active" });

        for (const subscriber of subscribers) {
          await doUpdate(subscriber);
        }

        logger.info(
          `Updated engagement scores for ${subscribers.length} subscribers`
        );
      }
    } catch (error) {
      logger.error("Error updating engagement scores:", error);
      throw error;
    }
  }

  private static calculateEngagementScore(subscriber: ISubscriber): number {
    const {
      metrics: {
        sent = 0,
        speedOpens = 0,
        regularOpens = 0,
        clicks = 0,
        conversions = 0,
        bounces = 0,
      },
      lastInteraction,
    } = subscriber;

    const weights = {
      speedOpens: 3,
      regularOpens: 1,
      clicks: 2,
      conversions: 3,
      bounces: 2, // Negative factor (subtracted in the formula)
    };

    // 1. Calculate days since last interaction
    const daysSinceLastInteraction =
      (Date.now() - new Date(lastInteraction).getTime()) /
      (1000 * 60 * 60 * 24);

    // 2. Compute recency factor (linear decay to 0 at 90 days)
    const DORMANCY_THRESHOLD_DAYS = 90;
    const recencyFactor = Math.max(
      0,
      1 - daysSinceLastInteraction / DORMANCY_THRESHOLD_DAYS
    );

    // 3. Compute the base score using the weighted counts.
    //    Bounces subtract from the score.
    let baseScore =
      speedOpens * weights.speedOpens +
      regularOpens * weights.regularOpens +
      clicks * weights.clicks +
      conversions * weights.conversions -
      bounces * weights.bounces;

    // 4. Normalize by the total number of sent emails.
    //    This calculates the average weighted engagement per email.
    const normalizedScore = sent > 0 ? baseScore / sent : 0;

    // 5. Apply the recency factor.
    let finalScore = normalizedScore * recencyFactor;

    // 6. Scale the final score to a 0-100 range.
    const scalingFactor = 100 / 9; // 9 is the maximum possible score
    finalScore = finalScore * scalingFactor;

    // 7. Clamp the final score to the range [0, 100]
    finalScore = Math.min(100, Math.max(0, finalScore));

    return finalScore;
  }
}
