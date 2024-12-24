import { Request, Response } from "express";
import { MetricsTrackingService } from "./metrics-tracking.service";
import { logger } from "@config/logger";
import { Subscriber } from "@features/subscriber/models/subscriber.model";

interface RevenueByDate {
  [key: string]: number;
}

interface SourceCounts {
  [key: string]: number;
}

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

  static async getSubscriberMetrics(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const timeRange = parseInt(req.query.days as string) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const subscribers = await Subscriber.find({
        userId,
        createdAt: { $gte: startDate },
      });

      const engagement = {
        opens: subscribers.reduce(
          (sum, sub) => sum + (sub.metrics?.opens || 0),
          0,
        ),
        clicks: subscribers.reduce(
          (sum, sub) => sum + (sub.metrics?.clicks || 0),
          0,
        ),
        bounces: subscribers.reduce(
          (sum, sub) => sum + (sub.metrics?.bounces || 0),
          0,
        ),
        total: subscribers.length,
      };

      const revenueByDate: RevenueByDate = subscribers.reduce((acc, sub) => {
        const date = sub.createdAt.toISOString().split("T")[0];
        acc[date] = (acc[date] || 0) + (sub.metrics?.revenue || 0);
        return acc;
      }, {} as RevenueByDate);

      const revenueData = Object.entries(revenueByDate).map(
        ([date, revenue]) => ({
          date,
          revenue,
        }),
      );

      const sources: SourceCounts = subscribers.reduce((acc, sub) => {
        const source = sub.metadata?.source || "direct";
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as SourceCounts);

      const sourceData = Object.entries(sources).map(([name, value]) => ({
        name,
        value,
      }));

      res.json({
        success: true,
        data: {
          engagement,
          revenueData,
          sources: sourceData,
        },
      });
    } catch (error) {
      logger.error("Error getting subscriber metrics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get subscriber metrics",
      });
    }
  }
}
