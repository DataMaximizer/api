import { Request, Response } from "express";
import { AnalyticsService } from "./analytics.service";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";

interface AuthRequest extends Request {
  user?: IUser;
}

export class AnalyticsController {
  /**
   * Get revenue data grouped by month
   * @param req Express request object with authenticated user
   * @param res Express response object
   */
  static async getRevenue(req: AuthRequest, res: Response) {
    try {
      if (!req.user || !req.user._id) {
        return res
          .status(401)
          .json({ success: false, error: "User not authenticated" });
      }

      const userId = req.user._id.toString();
      const revenueData = await AnalyticsService.getRevenue(userId);

      res.json({ success: true, data: revenueData });
    } catch (error) {
      logger.error("Error getting revenue:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to get revenue data" });
    }
  }

  /**
   * Get all email analytics data (clicks, conversions, bounces) grouped by month
   * @param req Express request object with authenticated user
   * @param res Express response object
   */
  static async getEmailAnalytics(req: AuthRequest, res: Response) {
    try {
      if (!req.user || !req.user._id) {
        return res
          .status(401)
          .json({ success: false, error: "User not authenticated" });
      }

      const userId = req.user._id.toString();

      // Fetch all analytics data in parallel
      const [clicksData, conversionsData, bouncesData] = await Promise.all([
        AnalyticsService.getClicks(userId),
        AnalyticsService.getConversions(userId),
        AnalyticsService.getBounces(userId),
      ]);

      // Create a map of all months that appear in any dataset
      const monthsMap = new Map<
        string,
        { clicks: number; conversions: number; bounces: number }
      >();

      // Process clicks data
      clicksData.forEach((item) => {
        if (!monthsMap.has(item.month)) {
          monthsMap.set(item.month, { clicks: 0, conversions: 0, bounces: 0 });
        }
        monthsMap.get(item.month)!.clicks = item.clicks;
      });

      // Process conversions data
      conversionsData.forEach((item) => {
        if (!monthsMap.has(item.month)) {
          monthsMap.set(item.month, { clicks: 0, conversions: 0, bounces: 0 });
        }
        monthsMap.get(item.month)!.conversions = item.conversions;
      });

      // Process bounces data
      bouncesData.forEach((item) => {
        if (!monthsMap.has(item.month)) {
          monthsMap.set(item.month, { clicks: 0, conversions: 0, bounces: 0 });
        }
        monthsMap.get(item.month)!.bounces = item.bounces;
      });

      // Convert map to array and sort by month (newest first)
      const emailData = Array.from(monthsMap.entries()).map(
        ([month, data]) => ({
          month,
          ...data,
        })
      );

      emailData.sort((a, b) => b.month.localeCompare(a.month));

      res.json({
        success: true,
        data: emailData,
      });
    } catch (error) {
      logger.error("Error getting email analytics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to get email analytics data" });
    }
  }

  /**
   * Get subscriber and unsubscriber data grouped by month
   * @param req Express request object with authenticated user
   * @param res Express response object
   */
  static async getSubscriberAnalytics(req: AuthRequest, res: Response) {
    try {
      if (!req.user || !req.user._id) {
        return res
          .status(401)
          .json({ success: false, error: "User not authenticated" });
      }

      const userId = req.user._id.toString();
      const subscriberData = await AnalyticsService.getSubscriberAnalytics(
        userId
      );

      res.json({
        success: true,
        data: subscriberData,
      });
    } catch (error) {
      logger.error("Error getting subscriber analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get subscriber analytics data",
      });
    }
  }
}
