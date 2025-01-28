import { Router } from "express";
import { MetricsTrackingService } from "@features/metrics/metrics-tracking.service";
import { Postback } from "../tracking/models/postback.model";
import { logger } from "@config/logger";
import { isValidUrl } from "@/core/utils/url";
import { Click } from "../tracking/models/click.model";

const router = Router();

router.get("/pixel/:subscriberId", async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

    await MetricsTrackingService.trackOpen(subscriberId, campaignId as string);

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
    const { url, subscriberId, linkId, campaignId } = req.query;

    if (!url || !isValidUrl(url as string)) {
      logger.warn("Invalid URL in redirect:", { url });
      res.status(400).send("Invalid URL");
      return;
    }

    const clickId = await MetricsTrackingService.trackClick(
      subscriberId as string,
      linkId as string,
      campaignId as string,
      req
    );

    const targetUrl = `${
      url as string
    }&clickId=${clickId}&sub_id=${subscriberId}&campaign_id=${campaignId}&link_id=${linkId}`;

    res.redirect(targetUrl.toString());
  } catch (error) {
    logger.error("Error tracking click:", error);
    res.redirect(req.query.url as string);
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
