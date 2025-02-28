import { Router } from "express";
import { MetricsTrackingService } from "@features/metrics/metrics-tracking.service";
import { logger } from "@config/logger";
import { Click } from "../tracking/models/click.model";
import { Campaign } from "../campaign/models/campaign.model";
import { AffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { SubscriberCleanupService } from "../subscriber/subscriber-cleanup.service";

const router = Router();

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

export default router;
