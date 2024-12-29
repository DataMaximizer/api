import { Request, Response } from "express";
import { AffiliateService } from "./affiliate.service";
import { logger } from "@config/logger";
import { UrlAnalysisService } from "@features/url-analysis/url-analysis.service";
import { CacheService } from '@core/services/cache.service';

export class AffiliateController {
  static async createOffer(req: Request, res: Response) {
    try {
      const offerData = {
        ...req.body,
        userId: req.user?._id,
        isAdminOffer: req.user?.type === "owner",
      };

      const offer = await AffiliateService.createOffer(offerData);
      
      // Clear offers cache after creating new offer
      await CacheService.delByPattern('offers:*');
      
      res.status(201).json(offer);
    } catch (error) {
      logger.error("Error creating offer:", error);
      res.status(400).json({ error: "Failed to create offer" });
    }
  }

  static async getOffers(req: Request, res: Response) {
    try {
      const {
        category,
        status,
        search,
        sort = "createdAt",
        order = "desc",
      } = req.query;

      const filters: any = {};

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

  static async getOfferById(req: Request, res: Response) {
    try {
      const offer = await AffiliateService.getOfferById(req.params.id);

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: "Offer not found",
        });
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

  static async deleteOffer(req: Request, res: Response) {
    try {
      const offer = await AffiliateService.deleteOffer(req.params.id);

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: "Offer not found",
        });
      }

      res.json({
        success: true,
        message: "Offer deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting offer:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete offer",
      });
    }
  }

  static async updateOffer(req: Request, res: Response) {
    try {
      const offer = await AffiliateService.updateOffer(req.params.id, req.body);
      res.json(offer);
    } catch (error) {
      logger.error("Error updating offer:", error);
      res.status(400).json({ error: "Failed to update offer" });
    }
  }

  static async validateOffers(req: Request, res: Response) {
    try {
      await AffiliateService.validateOffers();
      res.json({ message: "Validation completed" });
    } catch (error) {
      logger.error("Error validating offers:", error);
      res.status(500).json({ error: "Failed to validate offers" });
    }
  }

  static async deleteAnalyzedUrl(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Analysis ID is required",
        });
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
}
