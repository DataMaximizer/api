import { Request, Response, NextFunction } from "express";
import { AIConfigService } from "@features/ai/config/ai-config.service";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";
import { SubscriberList } from "@/features/subscriber/models/subscriber-list.model";
import { Subscriber } from "@/features/subscriber/models/subscriber.model";
import { OfferSelectionAgent } from "../agents/offer-selection/OfferSelectionAgent";
import { ConversionAnalysisAgent } from "../agents/conversion-analysis/ConversionAnalysisAgent";
import { WritingStyleOptimizationAgent } from "../agents/writing-style/WritingStyleOptimizationAgent";
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

      // Retrieve all subscribers associated with this list.
      // Note: Subscribers store the list references in the "lists" property.
      const subscribers = await Subscriber.find({
        lists: subscriberListId,
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

  static async runWritingStyleOptimization(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { offerId, subscriberId } = req.body;
      if (!subscriberId || !subscriberId) {
        res.status(400).json({
          success: false,
          message: "subscriberId and offerId are required.",
        });
      }

      const agent = new WritingStyleOptimizationAgent();
      const result = await agent.generateEmailMarketing(offerId, subscriberId);

      res.status(200).json({
        success: true,
        emailContent: JSON.parse(result.emailContent),
        framework: result.framework,
        tone: result.tone,
        personality: result.personality,
        recommendedStyle: result.recommendedStyle,
      });
    } catch (error) {
      console.error("Error in runWritingStyleOptimization:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async startCampaign(req: Request, res: Response): Promise<void> {
    try {
      const { offerId, smtpProviderId, campaignData, emailData } = req.body;

      const agent = new WritingStyleOptimizationAgent();
      await agent.startCampaign(
        offerId,
        smtpProviderId,
        req.user?._id?.toString() || "",
        campaignData,
        emailData
      );

      res.status(200).json({
        success: true,
        message: "Campaign started successfully",
      });
    } catch (error) {
      console.error("Error in startCampaign:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
