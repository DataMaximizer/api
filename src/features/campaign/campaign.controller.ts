import { Request, Response, NextFunction } from "express";
import { CampaignService } from "./campaign.service";
import { Campaign } from "./models/campaign.model";
import { AffiliateService } from "@features/affiliate/affiliate.service";
import { AIContentService } from "@features/ai/content/ai-content.service";
import { logger } from "@config/logger";
import {
  ContentFramework,
  WritingTone,
} from "@features/ai/models/ai-content.model";

export class CampaignController {
  static async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const campaignData = {
        ...req.body,
        userId: req.user?._id,
      };

      const campaign = await CampaignService.createCampaign(campaignData);
      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCampaigns(req: Request, res: Response): Promise<void> {
    try {
      logger.info("Fetching campaigns with query:", req.query);

      const filter: any = {};
      if (req.query.type) {
        filter.type = req.query.type.toString();
      }

      logger.info("Using filter:", filter);

      const campaigns = await Campaign.find(filter)
        .populate("offerId")
        .lean()
        .exec();

      logger.info(`Found ${campaigns.length} campaigns`);

      res.json({
        success: true,
        data: campaigns,
      });
    } catch (error) {
      logger.error("Error in getCampaigns:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        details: error,
      });
    }
  }

  static async getCampaignById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const campaign = await Campaign.findOne({
        _id: req.params.id,
        userId: req.user?._id,
      }).populate("smtpProviderId", "name");

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const campaign = await Campaign.findOneAndUpdate(
        { _id: req.params.id, userId: req.user?._id },
        req.body,
        { new: true },
      );

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const campaign = await Campaign.findOneAndDelete({
        _id: req.params.id,
        userId: req.user?._id,
      });

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Campaign deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async generateVariants(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { productInfo, numberOfVariants } = req.body;
      const variants = await CampaignService.generateEmailVariants(
        req.params.id,
        productInfo,
        numberOfVariants,
      );

      res.json({
        success: true,
        data: variants,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateMetrics(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await CampaignService.updateCampaignMetrics(
        req.params.id,
        req.params.variantId,
        req.body,
      );

      res.json({
        success: true,
        message: "Metrics updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async generateContent(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { offerId, framework, tone, numberOfVariants = 3 } = req.body;

      logger.info(
        `Generating content for offer ${offerId} with framework ${framework} and tone ${tone}`,
      );

      const offer = await AffiliateService.getOfferById(offerId);
      if (!offer) {
        res.status(404).json({
          success: false,
          error: "Offer not found",
        });
        return;
      }

      if (!Object.values(ContentFramework).includes(framework)) {
        res.status(400).json({
          success: false,
          error: `Invalid framework. Must be one of: ${Object.values(ContentFramework).join(", ")}`,
        });
        return;
      }

      if (!Object.values(WritingTone).includes(tone)) {
        res.status(400).json({
          success: false,
          error: `Invalid tone. Must be one of: ${Object.values(WritingTone).join(", ")}`,
        });
        return;
      }

      const variants = await AIContentService.generateContentVariants(
        {
          name: offer.name,
          description: offer.description,
          productInfo: offer.productInfo,
          tags: offer.tags,
          price: offer.productInfo.pricing,
          targetAudience: offer.productInfo.targetAudience,
          benefits: offer.productInfo.benefits || [],
          uniqueSellingPoints: offer.productInfo.uniqueSellingPoints || [],
        },
        framework as ContentFramework,
        tone as WritingTone,
        numberOfVariants,
      );

      res.json({
        success: true,
        data: variants,
      });
    } catch (error) {
      logger.error("Error generating content:", error);
      next(error);
    }
  }

  static async generateCustomContent(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { offerId, prompt, tone, style } = req.body;

      const variant = await CampaignService.generateCustomEmailContent(
        offerId,
        prompt,
        tone,
      );

      res.json({
        success: true,
        data: variant,
      });
    } catch (error) {
      next(error);
    }
  }

  static async regenerateVariant(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { offerId, framework, tone } = req.body;

      const offer = await AffiliateService.getOfferById(offerId);
      if (!offer) {
        res.status(404).json({
          success: false,
          error: "Offer not found",
        });
        return;
      }

      const variants = await AIContentService.generateContentVariants(
        {
          name: offer.name,
          description: offer.description,
          productInfo: offer.productInfo,
          tags: offer.tags,
          price: offer.productInfo.pricing,
          targetAudience: offer.productInfo.targetAudience,
          benefits: offer.productInfo.benefits || [],
          uniqueSellingPoints: offer.productInfo.uniqueSellingPoints || [],
        },
        framework,
        tone,
        1,
      );

      res.json({
        success: true,
        data: variants[0],
      });
    } catch (error) {
      logger.error("Error regenerating variant:", error);
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const campaign = await CampaignService.updateCampaignStatus(
        req.params.id,
        status,
      );

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  }
}