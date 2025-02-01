import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { logger } from "@config/logger";
import { Campaign } from "../campaign/models/campaign.model";
import { IAffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { CampaignService } from "../campaign/campaign.service";
import { Postback } from "../tracking/models/postback.model";
import { Click } from "../tracking/models/click.model";
import { Request } from "express";

const SPEED_OPEN_HOURS_THRESHOLD = 1;

type ProcessPostbackParams = {
  campaignId: string;
  subscriberId: string;
  payout?: number;
  postbackId: string;
};

export class MetricsTrackingService {
  static async trackOpen(subscriberId: string, campaignId: string) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const emailSentAt = campaign.lastEmailSentAt || new Date();
      const now = new Date();
      const timeSinceEmailSent = now.getTime() - emailSentAt.getTime();
      const hourDiff = timeSinceEmailSent / (1000 * 60 * 60);
      let updateType = "regularOpens";

      if (hourDiff <= SPEED_OPEN_HOURS_THRESHOLD) {
        updateType = "speedOpens";
      }

      await Promise.all([
        // Update subscriber metrics
        Subscriber.findByIdAndUpdate(
          subscriberId,
          {
            $inc: { [`metrics.${updateType}`]: 1 },
            $set: {
              lastInteraction: new Date(),
              "metrics.lastOpen": new Date(),
            },
            $push: {
              "metrics.interactions": {
                type: updateType.slice(0, -1),
                campaignId,
                timestamp: new Date(),
              },
            },
          },
          { upsert: false }
        ),

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
