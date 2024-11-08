import { Request, Response } from "express";
import { MetricsTrackingService } from "../services/metrics-tracking.service";
import { logger } from "../config/logger";

export class MetricsController {
	static async trackOpen(req: Request, res: Response) {
		try {
			const { subscriberId } = req.params;
			const { campaignId } = req.body;

			await MetricsTrackingService.trackOpen(subscriberId, campaignId);
			await MetricsTrackingService.updateEngagementScore(subscriberId);

			res.json({ success: true });
		} catch (error) {
			logger.error("Error tracking open:", error);
			res.status(500).json({ success: false, error: "Failed to track open" });
		}
	}

	static async trackClick(req: Request, res: Response) {
		try {
			const { subscriberId } = req.params;
			const { linkId, campaignId } = req.body;

			await MetricsTrackingService.trackClick(subscriberId, linkId, campaignId);
			await MetricsTrackingService.updateEngagementScore(subscriberId);

			res.json({ success: true });
		} catch (error) {
			logger.error("Error tracking click:", error);
			res.status(500).json({ success: false, error: "Failed to track click" });
		}
	}

	static async trackConversion(req: Request, res: Response) {
		try {
			const { subscriberId } = req.params;
			const { amount, productId } = req.body;

			await MetricsTrackingService.trackConversion(
				subscriberId,
				amount,
				productId,
			);
			await MetricsTrackingService.updateEngagementScore(subscriberId);

			res.json({ success: true });
		} catch (error) {
			logger.error("Error tracking conversion:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to track conversion" });
		}
	}

	static async trackBounce(req: Request, res: Response) {
		try {
			const { subscriberId } = req.params;
			const { bounceType, reason } = req.body;

			await MetricsTrackingService.trackBounce(
				subscriberId,
				bounceType,
				reason,
			);
			await MetricsTrackingService.updateEngagementScore(subscriberId);

			res.json({ success: true });
		} catch (error) {
			logger.error("Error tracking bounce:", error);
			res.status(500).json({ success: false, error: "Failed to track bounce" });
		}
	}
}
