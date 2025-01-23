import { Router } from "express";
import { MetricsTrackingService } from "@features/metrics/metrics-tracking.service";
import { Postback } from "../tracking/models/postback.model";
import { logger } from "@config/logger";
import { isValidUrl } from "@/core/utils/url";

const router = Router();

router.get("/pixel/:subscriberId", async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

    await MetricsTrackingService.trackOpen(subscriberId, campaignId as string);

    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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

    await MetricsTrackingService.trackClick(
      subscriberId as string,
      linkId as string,
      campaignId as string,
      req
    );

    // res.redirect(
    //   `${affiliateOfferUrl}?sub_id=${subscriberId}&campaign_id=${campaignId}`
    // );
    res.redirect(url as string);
  } catch (error) {
    logger.error("Error tracking click:", error);
    res.redirect(req.query.url as string);
  }
});

router.get("/postback", async (req, res) => {
  try {
    const { subscriberId, campaignId } = req.query as Record<string, string>;

    if (!subscriberId || !campaignId) {
      res.status(400).send("Missing required parameters");
      return;
    }

    // Create a pending postback record first to handle race conditions
    const pendingPostback = await Postback.create({
      subscriberId,
      campaignId,
      status: "pending",
      metadata: {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        referrer: req.headers["referer"],
      },
    });

    const isValid = await MetricsTrackingService.validatePostback({
      subscriberId,
      campaignId,
    });

    if (!isValid) {
      await Postback.findByIdAndUpdate(pendingPostback._id, {
        status: "failed",
        errorMessage: "Invalid postback validation",
      });

      logger.warn("Invalid postback attempt:", {
        subscriberId,
        campaignId,
        query: req.query,
      });
      res.status(400).send("Invalid request");
      return;
    }

    try {
      await MetricsTrackingService.processPostback({
        subscriberId,
        campaignId,
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
