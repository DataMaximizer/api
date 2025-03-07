import { Request, Response, NextFunction } from "express";
import { UrlAnalysisService } from "./url-analysis.service";
import { AffiliateService } from "@features/affiliate/affiliate.service";
import { logger } from "@config/logger";
import { AutomatedEmailService } from "@features/email/automated/automated-email.service";

export class UrlAnalysisController {
  static async createOfferFromUrl(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { url, commissionRate, parameters, networkId } = req.body;
      const userId = req.user?._id;

      if (!url || !userId) {
        res.status(400).json({
          success: false,
          error: "URL, commission rate, and user ID are required",
        });
        return;
      }

      const offerData = await UrlAnalysisService.createOfferFromUrl(
        url,
        userId.toString(),
        commissionRate,
        parameters,
        networkId
      );

      const offer = await AffiliateService.createOffer(offerData);

      res.status(201).json({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error("Error in createOfferFromUrl:", error);
      next(error);
    }
  }

  static async deleteAnalysis(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await UrlAnalysisService.deleteAnalysis(req.params.id);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error in deleteAnalysis:", error);
      next(error);
    }
  }

  static async createCompleteOfferFromUrl(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { url, commissionRate, subscriberListId, smtpProviderId } =
        req.body;
      const userId = req.user?._id;

      await AutomatedEmailService.processUrlAndGenerateEmail(
        url,
        commissionRate,
        userId as string,
        subscriberListId,
        smtpProviderId,
        res
      );

      res.status(201).json({
        success: true,
        message: "Offer created and email campaign sent successfully",
      });
    } catch (error) {
      logger.error("Error in createOfferFromUrl:", error);
      next(error);
    }
  }
}
