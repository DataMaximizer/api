import { NextFunction, Request, Response } from "express";
import { AffiliateService } from "./affiliate.service";
import { logger } from "@config/logger";
import { UrlAnalysisService } from "@features/url-analysis/url-analysis.service";
import { CacheService } from "@core/services/cache.service";
import { UserService } from "../user/user.service";

export class AffiliateController {
  static async createOffer(req: Request, res: Response): Promise<void> {
    try {
      const offerData = {
        ...req.body,
        userId: req.user?._id,
        isAdminOffer: req.user?.type === "owner",
        networkId: req.body.networkId,
      };

      const offer = await AffiliateService.createOffer(offerData, true);

      res.status(201).json(offer);
    } catch (error) {
      logger.error("Error creating offer:", error);
      res.status(400).json({ error: "Failed to create offer" });
    }
  }

  static async getOffers(req: Request, res: Response): Promise<void> {
    try {
      const {
        category,
        status,
        search,
        sort = "createdAt",
        order = "desc",
      } = req.query;

      const filters: any = {
        userId: req.user?._id,
      };

      if (category) filters.categories = category;
      if (status) filters.status = status;
      if (search) {
        filters.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const offers = await AffiliateService.getOffers(filters, {
        sort: { [sort as string]: order === "desc" ? -1 : 1 },
      });

      res.json({
        success: true,
        data: offers,
      });
    } catch (error) {
      logger.error("Error fetching offers:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch offers",
      });
    }
  }

  static async getOfferById(req: Request, res: Response): Promise<void> {
    try {
      const offer = await AffiliateService.getOfferById(req.params.id);

      if (!offer) {
        res.status(404).json({
          success: false,
          error: "Offer not found",
        });
        return;
      }

      res.json({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error("Error fetching offer:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch offer",
      });
    }
  }

  static async deleteOffer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?._id;

      if (!id || !userId) {
        res.status(400).json({
          success: false,
          error: "Offer ID and user ID are required",
        });
        return;
      }

      const result = await AffiliateService.deleteOffer(id, userId as string);

      if (!result) {
        res.status(500).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error("Error deleting offer:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete offer",
      });
    }
  }

  static async updateOffer(req: Request, res: Response): Promise<void> {
    try {
      const offer = await AffiliateService.updateOffer(req.params.id, req.body);
      res.json(offer);
    } catch (error) {
      logger.error("Error updating offer:", error);
      res.status(400).json({ error: "Failed to update offer" });
    }
  }

  static async validateOffers(req: Request, res: Response): Promise<void> {
    try {
      await AffiliateService.validateOffers();
      res.json({ message: "Validation completed" });
    } catch (error) {
      logger.error("Error validating offers:", error);
      res.status(500).json({ error: "Failed to validate offers" });
    }
  }

  static async deleteAnalyzedUrl(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: "Analysis ID is required",
        });
        return;
      }

      await UrlAnalysisService.deleteAnalysis(id);

      res.json({
        success: true,
        message: "Analysis deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting analyzed URL:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete analysis",
      });
    }
  }

  static async generateOfferFromImage(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No image file provided",
        });
        return;
      }

      const { aiProvider } = req.body;

      if (!aiProvider) {
        res.status(400).json({
          success: false,
          error: "AI provider is required",
        });
        return;
      }

      const apiKeys = await UserService.getUserApiKeys(req.user?._id as string);
      const affiliateService = new AffiliateService();
      const generatedContent = await affiliateService.generateOfferFromImage(
        req.file.buffer,
        aiProvider as "openai" | "claude",
        apiKeys.openAiKey,
        apiKeys.claudeKey
      );

      res.status(200).json({
        success: true,
        data: generatedContent,
      });
    } catch (error) {
      logger.error("Error generating offer from image:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate offer from image",
      });
    }
  }

  static async getOfferReport(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const reports = await AffiliateService.getOfferReports(
        req.user?._id as string
      );
      res.status(200).json({
        success: true,
        data: reports,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getOfferAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const offerId = req.query?.offerId as string;
      const analytics = await AffiliateService.getOfferAnalytics(
        req.user?._id as string,
        offerId
      );
      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
}
