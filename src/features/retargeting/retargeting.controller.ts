import { Request, Response, NextFunction } from "express";
import { RetargetingService } from "./retargeting.service";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { Campaign } from "@features/campaign/models/campaign.model";
import { logger } from "@config/logger";
import { IUser } from "@features/auth/models/user.model";

interface AuthRequest extends Request {
  user?: IUser;
}

export class RetargetingController {
  static async getSubscriberInterests(
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

      const interests =
        await RetargetingService.analyzeSubscriberInterests(subscriberId);

      res.json({
        success: true,
        data: interests,
      });
    } catch (error) {
      logger.error("Error getting subscriber interests:", error);
      next(error);
    }
  }

  static async getRetargetingStatus(
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

      const shouldContinue =
        await RetargetingService.shouldContinueTargeting(subscriberId);
      const interests =
        await RetargetingService.analyzeSubscriberInterests(subscriberId);
      const newCategories =
        await RetargetingService.findNewInterests(subscriberId);

      // Get active retargeting campaigns
      const activeRetargeting = await Campaign.find({
        userId,
        segments: subscriberId,
        "settings.isRetargeting": true,
        status: { $in: ["draft", "scheduled", "running"] },
      }).select("name status createdAt");

      res.json({
        success: true,
        data: {
          canRetarget: shouldContinue,
          currentInterests: interests,
          suggestedCategories: newCategories,
          activeRetargetingCampaigns: activeRetargeting,
        },
      });
    } catch (error) {
      logger.error("Error getting retargeting status:", error);
      next(error);
    }
  }

  static async createRetargetingCampaign(
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

      // Check if retargeting should continue
      const shouldContinue =
        await RetargetingService.shouldContinueTargeting(subscriberId);
      if (!shouldContinue) {
        res.status(400).json({
          success: false,
          error: "Subscriber does not meet retargeting criteria",
        });
        return;
      }

      const campaign = await RetargetingService.generateRetargetingCampaign(
        subscriberId,
        userId,
      );

      if (!campaign) {
        res.status(400).json({
          success: false,
          error: "Unable to generate retargeting campaign",
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      logger.error("Error creating retargeting campaign:", error);
      next(error);
    }
  }
}
