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
}
