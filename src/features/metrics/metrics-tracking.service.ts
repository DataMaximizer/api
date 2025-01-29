import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { logger } from "@config/logger";
import { Campaign } from "../campaign/models/campaign.model";
import {
  AffiliateOffer,
  IAffiliateOffer,
} from "../affiliate/models/affiliate-offer.model";
import { CampaignService } from "../campaign/campaign.service";
import { Postback } from "../tracking/models/postback.model";
import { Click } from "../tracking/models/click.model";
import { Request } from "express";

type ProcessPostbackParams = {
  campaignId: string;
  subscriberId: string;
  payout?: number;
  postbackId: string;
};

export class MetricsTrackingService {
  static async trackOpen(subscriberId: string, campaignId?: string) {
    try {
      await Promise.all([
        // Update subscriber metrics
        Subscriber.findByIdAndUpdate(
          subscriberId,
          {
            $inc: { "metrics.opens": 1 },
            $set: {
              lastInteraction: new Date(),
              "metrics.lastOpen": new Date(),
            },
            $push: {
              "metrics.interactions": {
                type: "open",
                campaignId,
                timestamp: new Date(),
              },
            },
          },
          { upsert: false }
        ),
        // Update campaign metrics if campaignId exists
        campaignId &&
          Campaign.findByIdAndUpdate(
            campaignId,
            {
              $inc: { "metrics.totalOpens": 1 },
            },
            { upsert: false }
          ),
      ]);
    } catch (error) {
      logger.error(
        `Error tracking open for subscriber ${subscriberId}:`,
        error
      );
      throw error;
    }
  }

  static async trackClick(
    subscriberId: string,
    linkId: string,
    campaignId: string,
    req?: Request,
    clickId?: string
  ): Promise<string> {
    try {
      let click;
      if (clickId) {
        click = await Click.findById(clickId);
        if (!click) {
          throw new Error("Click not found");
        }
      } else {
        click = await Click.create({
          subscriberId,
          campaignId,
          linkId,
          timestamp: new Date(),
          metadata: {
            ip: req?.ip,
            userAgent: req?.headers["user-agent"] || undefined,
            referrer: req?.headers["referer"] || undefined,
          },
        });
      }

      await Subscriber.findByIdAndUpdate(subscriberId, {
        $inc: { "metrics.clicks": 1 },
        $set: {
          lastInteraction: new Date(),
          "metrics.lastClick": new Date(),
        },
        $push: {
          "metrics.interactions": {
            type: "click",
            linkId,
            clickId: click._id,
            campaignId,
            timestamp: new Date(),
          },
        },
      });

      await CampaignService.updateCampaignMetrics(campaignId, "", {
        clicks: 1,
      });

      return click._id as string;
    } catch (error) {
      logger.error(
        `Error tracking click for subscriber ${subscriberId}:`,
        error
      );
      throw error;
    }
  }

  static async trackConversion(
    subscriberId: string,
    amount: number,
    productId: string,
    campaignId?: string,
    postbackId?: string,
    clickId?: string
  ) {
    try {
      await Subscriber.findByIdAndUpdate(subscriberId, {
        $inc: {
          "metrics.conversions": 1,
          "metrics.revenue": amount,
        },
        $set: { lastInteraction: new Date() },
        $push: {
          "metrics.interactions": {
            type: "conversion",
            productId,
            amount,
            campaignId,
            postbackId,
            clickId,
            timestamp: new Date(),
          },
        },
      });
    } catch (error) {
      logger.error(
        `Error tracking conversion for subscriber ${subscriberId}:`,
        error
      );
      throw error;
    }
  }

  static async trackBounce(
    subscriberId: string,
    bounceType: "hard" | "soft",
    reason: string,
    bounceDate: Date
  ) {
    try {
      const subscriber = await Subscriber.findById(subscriberId);
      if (!subscriber) return;

      const bounceCount = (subscriber.metrics?.bounces || 0) + 1;
      const status =
        bounceType === "hard" || bounceCount >= 3
          ? "bounced"
          : subscriber.status;

      await Subscriber.findByIdAndUpdate(subscriberId, {
        $inc: { "metrics.bounces": 1 },
        $set: {
          status,
          lastInteraction: new Date(),
          ...(status === "bounced" && {
            "metadata.bounceReason": reason,
            "metadata.bounceDate": bounceDate,
          }),
        },
        $push: {
          "metrics.interactions": {
            type: "bounce",
            bounceType,
            reason,
            timestamp: bounceDate,
          },
        },
      });
    } catch (error) {
      logger.error(
        `Error tracking bounce for subscriber ${subscriberId}:`,
        error
      );
      throw error;
    }
  }

  static async updateEngagementScore(subscriberId: string) {
    try {
      const subscriber = await Subscriber.findById(subscriberId);
      if (!subscriber) return;

      const score = await this.calculateEngagementScore(subscriber);

      await Subscriber.findByIdAndUpdate(subscriberId, {
        $set: {
          engagementScore: score,
          lastEngagementUpdate: new Date(),
        },
      });

      return score;
    } catch (error) {
      logger.error(
        `Error updating engagement score for subscriber ${subscriberId}:`,
        error
      );
      throw error;
    }
  }

  private static async calculateEngagementScore(
    subscriber: any
  ): Promise<number> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get recent interactions
    const recentInteractions = (subscriber.metrics?.interactions || []).filter(
      (i: { timestamp: string }) => new Date(i.timestamp) > thirtyDaysAgo
    );

    // Weight factors
    const weights = {
      open: 1,
      click: 2,
      conversion: 5,
      recency: 0.5,
    };

    // Calculate base score
    let score = recentInteractions.reduce(
      (acc: number, interaction: { type: string }) => {
        switch (interaction.type) {
          case "open":
            return acc + weights.open;
          case "click":
            return acc + weights.click;
          case "conversion":
            return acc + weights.conversion;
          default:
            return acc;
        }
      },
      0
    );

    // Normalize to 0-100 scale
    score = Math.min(100, (score / 50) * 100);

    // Apply recency factor
    const lastInteraction = new Date(subscriber.lastInteraction);
    const daysSinceLastInteraction =
      (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.max(0, 1 - daysSinceLastInteraction / 30);

    score *= 1 + recencyFactor * weights.recency;

    return Math.min(100, Math.max(0, score));
  }

  static async processPostback({
    campaignId,
    subscriberId,
    payout = 0,
    postbackId,
    clickId,
  }: ProcessPostbackParams & { clickId: string }) {
    if (!campaignId || !subscriberId) {
      throw new Error(
        "Missing required identifier (campaignId or subscriberId)."
      );
    }

    try {
      const campaign = await Campaign.findById(campaignId).populate<{
        offerId: IAffiliateOffer;
      }>([{ path: "offerId" }]);

      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const offer = campaign.offerId;
      if (!offer) {
        throw new Error("Offer not found on Campaign.");
      }

      const productId = "";
      const variantId = "";
      const amount = payout;

      await MetricsTrackingService.trackConversion(
        subscriberId,
        amount,
        productId,
        campaignId,
        postbackId,
        clickId
      );

      await CampaignService.updateCampaignMetrics(campaignId, variantId, {
        conversions: 1,
        revenue: amount,
      });
    } catch (err) {
      logger.error(
        `Error processing postback for subscriber ${subscriberId} and campaign ${campaignId}:`,
        err
      );
      throw err;
    }
  }

  static async isPostbackProcessed({
    subscriberId,
    campaignId,
  }: {
    subscriberId: string;
    campaignId: string;
  }): Promise<boolean> {
    try {
      // Check if we already have a successful postback for this combination
      const existingPostback = await Postback.findOne({
        subscriberId,
        campaignId,
        status: "completed",
      });

      return !!existingPostback;
    } catch (error) {
      logger.error("Error checking postback status:", error);
      throw error;
    }
  }

  static async validatePostback({
    clickId,
  }: {
    clickId: string;
  }): Promise<boolean> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const click = await Click.findOne({
        _id: clickId,
        timestamp: { $gt: twentyFourHoursAgo },
      }).populate("subscriberId");

      if (!click) {
        logger.warn(`Invalid postback: Click ${clickId} not found or too old`);
        return false;
      }

      const subscriber = click.subscriberId as any;
      if (!subscriber || subscriber.status !== "active") {
        logger.warn(`Invalid postback: Subscriber not found or inactive`);
        return false;
      }

      const campaign = await Campaign.findById(click.campaignId);
      if (!campaign) {
        logger.warn(`Invalid postback: Campaign not found`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Error validating postback:", error);
      throw error;
    }
  }
}
