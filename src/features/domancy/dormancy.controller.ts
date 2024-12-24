import { Request, Response, NextFunction } from "express";
import { DormancyService } from "./dormancy.service";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { logger } from "@config/logger";
import { IUser } from "@features/auth/models/user.model";

interface AuthRequest extends Request {
  user?: IUser;
}

export class DormancyController {
  static async getDormancyStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { subscriberId } = req.params;
      const userId = req.user?._id?.toString();

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      // Verify subscriber belongs to user
      const subscriber = await Subscriber.findOne({
        _id: subscriberId,
        userId,
      });

      if (!subscriber) {
        res.status(404).json({
          success: false,
          error: "Subscriber not found",
        });
        return;
      }

      const dormancyStats = await DormancyService.analyzeDormancy(subscriberId);

      res.json({
        success: true,
        data: dormancyStats,
      });
    } catch (error) {
      logger.error("Error getting dormancy status:", error);
      next(error);
    }
  }

  static async createReengagementCampaign(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { subscriberId } = req.params;
      const userId = req.user?._id?.toString();

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      // Verify subscriber belongs to user
      const subscriber = await Subscriber.findOne({
        _id: subscriberId,
        userId,
      });

      if (!subscriber) {
        res.status(404).json({
          success: false,
          error: "Subscriber not found",
        });
        return;
      }

      const campaign = await DormancyService.createReengagementCampaign(
        subscriberId,
        userId,
      );

      if (!campaign) {
        res.status(400).json({
          success: false,
          error: "Unable to create re-engagement campaign",
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      logger.error("Error creating re-engagement campaign:", error);
      next(error);
    }
  }

  static async getDormancyReport(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?._id?.toString();

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const report = await DormancyService.getDormancyReport(userId);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Error getting dormancy report:", error);
      next(error);
    }
  }

  static async handleDormantSubscribers(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?._id?.toString();

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      await DormancyService.handleDormantSubscribers(userId);

      res.json({
        success: true,
        message: "Dormant subscribers processed successfully",
      });
    } catch (error) {
      logger.error("Error handling dormant subscribers:", error);
      next(error);
    }
  }
}
