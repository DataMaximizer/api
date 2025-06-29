import { Request, Response, NextFunction } from "express";
import { AIConfigService } from "@features/ai/config/ai-config.service";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";
import { SubscriberList } from "@/features/subscriber/models/subscriber-list.model";
import { Subscriber } from "@/features/subscriber/models/subscriber.model";
import { OfferSelectionAgent } from "../agents/offer-selection/OfferSelectionAgent";
import { ConversionAnalysisAgent } from "../agents/conversion-analysis/ConversionAnalysisAgent";
import { WritingStyleOptimizationAgent } from "../agents/writing-style/WritingStyleOptimizationAgent";
import { v4 as uuidv4 } from "uuid";
import { CampaignTrackerService } from "../services/campaign-tracker.service";
import jwt from "jsonwebtoken";
import { config } from "@config/config";
import { BlockedEmail } from "@/features/subscriber/models/blocked-email.model";
import { Types } from "mongoose";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface AuthRequest extends Request {
  user?: IUser;
}

export class AIConfigController {
  static async getConfig(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const config = await AIConfigService.getConfig(req.user._id.toString());
      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error("Error in getConfig:", error);
      next(error);
    }
  }

  static async updateConfig(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const isValidApiKey = await AIConfigService.validateApiKey(
        req.body.provider,
        req.body.apiKey
      );

      if (!isValidApiKey) {
        res.status(400).json({
          success: false,
          error: "Invalid API key",
        });
        return;
      }

      const config = await AIConfigService.updateConfig(
        req.user._id.toString(),
        req.body
      );
      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error("Error in updateConfig:", error);
      next(error);
    }
  }

  static async deleteConfig(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      await AIConfigService.deleteConfig(req.user._id.toString());
      res.json({
        success: true,
        message: "AI configuration deleted successfully",
      });
    } catch (error) {
      logger.error("Error in deleteConfig:", error);
      next(error);
    }
  }

  static async validateApiKey(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { provider, apiKey } = req.body;
      const isValid = await AIConfigService.validateApiKey(provider, apiKey);

      res.json({
        success: true,
        data: { isValid },
      });
    } catch (error) {
      logger.error("Error in validateApiKey:", error);
      next(error);
    }
  }

  static async runOfferSelection(req: Request, res: Response): Promise<void> {
    try {
      const { subscriberListId, numOffers = 1 } = req.body;
      if (!subscriberListId) {
        res.status(400).json({
          success: false,
          message: "subscriberListId is required.",
        });

        return;
      }

      // Retrieve the SubscriberList document.
      const subscriberList = await SubscriberList.findById(subscriberListId);
      if (!subscriberList) {
        res.status(404).json({
          success: false,
          message: "Subscriber list not found.",
        });

        return;
      }

      const blockedEmails = await BlockedEmail.find({
        userId: req.user?._id,
      }).distinct("email");

      // Retrieve all subscribers associated with this list.
      // Note: Subscribers store the list references in the "lists" property.
      const subscribers = await Subscriber.find({
        lists: subscriberListId,
        status: "active",
        email: { $nin: blockedEmails },
      });
      if (!subscribers || subscribers.length === 0) {
        res.status(404).json({
          success: false,
          message: "No subscribers found in this list.",
        });

        return;
      }

      const agent = new OfferSelectionAgent();
      // Run the offer selection for each subscriber in parallel.
      const matches = await Promise.all(
        subscribers.map(async (subscriber) => {
          const { selectedOffers } = await agent.selectOfferForSubscriber(
            subscriber._id as string,
            numOffers
          );

          return {
            subscriberId: subscriber._id,
            offers: selectedOffers.map((offer) => ({
              method: offer.method,
              id: offer._id,
              name: offer.name,
              description: offer.description,
              url: offer.url,
              adjustments: offer.adjustments,
            })),
          };
        })
      );

      res.status(200).json({
        success: true,
        matches,
      });
    } catch (error) {
      console.error("Error in runOfferSelection:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async runConversionAnalysis(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { subscriberListId, numOffers = 1 } = req.body;
      if (!subscriberListId) {
        res.status(400).json({
          success: false,
          message: "subscriberListId is required.",
        });

        return;
      }

      const agent = new ConversionAnalysisAgent();
      const topOffers = await agent.getTopOffersByEPC(numOffers);
      const ret = topOffers.map((offer) => ({
        offerId: offer.offer._id,
        offerName: offer.offer.name,
        offerDescription: offer.offer.description,
        offerUrl: offer.offer.url,
        offerEPC: offer.earningsPerClick,
      }));

      res.status(200).json({
        success: true,
        topOffers,
      });
    } catch (error) {
      console.error("Error in runConversionAnalysis:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // static async runWritingStyleOptimization(
  //   req: Request,
  //   res: Response
  // ): Promise<void> {
  //   try {
  //     const { offerId, subscriberId } = req.body;
  //     if (!subscriberId || !subscriberId) {
  //       res.status(400).json({
  //         success: false,
  //         message: "subscriberId and offerId are required.",
  //       });
  //     }

  //     const agent = new WritingStyleOptimizationAgent();
  //     const result = await agent.generateEmailMarketing(offerId, subscriberId);

  //     res.status(200).json({
  //       success: true,
  //     });
  //   } catch (error) {
  //     console.error("Error in runWritingStyleOptimization:", error);
  //     res.status(500).json({
  //       success: false,
  //       error: error instanceof Error ? error.message : "Unknown error",
  //     });
  //   }
  // }

  static async getCampaignStatus(req: Request, res: Response): Promise<void> {
    try {
      const { campaignId } = req.params;
      const campaignTracker = CampaignTrackerService.getInstance();
      const campaign = await campaignTracker.getCampaignStatus(campaignId);

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
        return;
      }

      // Check if the campaign belongs to the requesting user
      if (campaign.userId.toString() !== req.user?._id?.toString()) {
        res.status(403).json({
          success: false,
          error: "Unauthorized access to campaign",
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      console.error("Error in getCampaignStatus:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async getUserCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const campaignTracker = CampaignTrackerService.getInstance();
      const campaigns = await campaignTracker.getUserCampaigns(
        req.user?._id?.toString() || ""
      );

      res.json({
        success: true,
        data: campaigns,
      });
    } catch (error) {
      console.error("Error in getUserCampaigns:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async subscribeToUserEvents(
    req: Request,
    res: Response
  ): Promise<void> {
    // Set CORS headers first, before any response
    const origin = req.headers.origin;
    if (
      origin === "https://app.inboxengine.ai" ||
      origin === "http://localhost:3000"
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Type, Authorization"
      );
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    // Set SSE headers before any response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering

    // Send initial heartbeat to establish connection
    res.write(": heartbeat\n\n");

    try {
      const token = req.query.token as string;
      if (!token) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "No token provided",
          })}\n\n`
        );
        res.end();
        return;
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const userId = decoded.userId;

      if (!userId) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "No user ID provided",
          })}\n\n`
        );
        res.end();
        return;
      }

      const campaignTracker = CampaignTrackerService.getInstance();

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

      // Set up heartbeat interval
      const heartbeatInterval = global.setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 30000); // Send heartbeat every 30 seconds

      const listener = (update: any) => {
        try {
          res.write(
            `data: ${JSON.stringify({ type: "update", campaign: update })}\n\n`
          );
        } catch (error) {
          // Client disconnected or other write error
          global.clearInterval(heartbeatInterval);
          campaignTracker.unsubscribeFromUserUpdates(userId, listener);
        }
      };

      campaignTracker.subscribeToUserUpdates(userId, listener);

      // Handle client disconnection
      req.on("close", () => {
        global.clearInterval(heartbeatInterval);
        campaignTracker.unsubscribeFromUserUpdates(userId, listener);
        res.end();
      });

      // Handle errors
      req.on("error", (error: Error) => {
        logger.error("EventSource error:", error);
        global.clearInterval(heartbeatInterval);
        campaignTracker.unsubscribeFromUserUpdates(userId, listener);
        res.end();
      });
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Invalid token",
        })}\n\n`
      );
      res.end();
    }
  }
}
