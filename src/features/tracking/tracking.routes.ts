import { Router } from "express";
import { MetricsTrackingService } from "@features/metrics/metrics-tracking.service";
import { Postback } from "../tracking/models/postback.model";
import { logger } from "@config/logger";
import { isValidUrl } from "@/core/utils/url";
import { Click } from "../tracking/models/click.model";
import { Campaign } from "../campaign/models/campaign.model";
import { AffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { SubscriberCleanupService } from "../subscriber/subscriber-cleanup.service";

const router = Router();

router.get("/pixel/:subscriberId", async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

    await MetricsTrackingService.trackOpen(subscriberId, campaignId as string);
    await SubscriberCleanupService.updateEngagementScores(subscriberId);

    // Add headers to prevent caching by Gmail proxy
    res.setHeader("Content-Type", "image/gif");
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    // Add a random query parameter to bypass caching
    res.setHeader("ETag", Math.random().toString());

    res.end(
      Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64"
      )
    );
  } catch (error) {
    console.error("Error tracking pixel:", error);
    res.status(500).end();
  }
});

router.get("/redirect", async (req, res) => {
  try {
    const { url, clickId } = req.query;

    if (!clickId) {
      logger.warn("Missing clickId in redirect");
      res.status(400).send("Missing clickId");
      return;
    }

    // Get click details first
    const click = await Click.findById(clickId);
    if (!click) {
      logger.warn("Click not found:", { clickId });
      res.status(404).send("Click not found");
      return;
    }

    // Get campaign and offer details from click
    const campaign = await Campaign.findById(click.campaignId);
    if (!campaign) {
      logger.warn("Campaign not found:", { campaignId: click.campaignId });
      res.status(404).send("Campaign not found");
      return;
    }

    const offer = await AffiliateOffer.findById(campaign.offerId);
    if (!offer) {
      logger.warn("Offer not found:", { offerId: campaign.offerId });
      res.status(404).send("Offer not found");
      return;
    }

    // Find the Click ID parameter configuration
    const clickIdParam = offer.parameters?.find(
      (param) => param.type === "Click ID"
    );
    if (!clickIdParam) {
      logger.warn("Click ID parameter not found in offer config");
      res.status(400).send("Invalid offer configuration");
      return;
    }

    await MetricsTrackingService.trackClick(
      click.subscriberId.toString(),
      click.linkId.toString(),
      click.campaignId.toString(),
      req,
      clickId as string
    );
    await SubscriberCleanupService.updateEngagementScores(
      click.subscriberId.toString()
    );

    res.redirect(url as string);
  } catch (error) {
    logger.error("Error tracking click:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/postback", async (req, res) => {
  try {
    const { clickId, payout } = req.query as Record<string, string>;

    if (!clickId) {
      res.status(400).send("Missing required parameters");
      return;
    }

    const click = await Click.findById(clickId);
    if (!click) {
      res.status(404).send("Click not found");
      return;
    }

    // Create a pending postback record first to handle race conditions
    const pendingPostback = await Postback.create({
      subscriberId: click.subscriberId,
      campaignId: click.campaignId,
      clickId,
      status: "pending",
      payout: payout ? parseFloat(payout) : undefined,
      metadata: {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        referrer: req.headers["referer"],
      },
    });

    const isValid = await MetricsTrackingService.validatePostback({
      clickId,
    });

    if (!isValid) {
      await Postback.findByIdAndUpdate(pendingPostback._id, {
        status: "failed",
        errorMessage: "Invalid postback validation",
      });

      logger.warn("Invalid postback attempt:", {
        clickId,
      });
      res.status(400).send("Invalid request");
      return;
    }

    try {
      await MetricsTrackingService.processPostback({
        subscriberId: click.subscriberId.toString(),
        campaignId: click.campaignId.toString(),
        payout: payout ? parseFloat(payout) : undefined,
        postbackId: pendingPostback._id as string,
        clickId: click._id as string,
      });

      await Postback.findByIdAndUpdate(pendingPostback._id, {
        status: "completed",
        processedAt: new Date(),
      });

      await SubscriberCleanupService.updateEngagementScores(
        click.subscriberId.toString()
      );

      res.status(200).send("OK");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await Postback.findByIdAndUpdate(pendingPostback._id, {
        status: "failed",
        errorMessage,
      });
      throw error;
    }
  } catch (error: unknown) {
    logger.error("Error handling postback:", error);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
