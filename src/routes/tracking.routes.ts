import { Router } from "express";
import { MetricsTrackingService } from "../services/metrics-tracking.service";

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
				"base64",
			),
		);
	} catch (error) {
		console.error("Error tracking pixel:", error);
		res.status(500).end();
	}
});

router.get("/redirect", async (req, res) => {
	try {
		const { url, subscriberId, linkId, campaignId } = req.query;

		await MetricsTrackingService.trackClick(
			subscriberId as string,
			linkId as string,
			campaignId as string,
		);

		res.redirect(url as string);
	} catch (error) {
		console.error("Error tracking click:", error);
		res.redirect(req.query.url as string);
	}
});

export default router;
