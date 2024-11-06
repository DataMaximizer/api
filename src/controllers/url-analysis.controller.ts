import { Request, Response, NextFunction } from "express";
import { UrlAnalysisService } from "../services/url-analysis.service";
import { AffiliateService } from "../services/affiliate.service";
import { logger } from "../config/logger";

export class UrlAnalysisController {
	static async createOfferFromUrl(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const { url, commissionRate } = req.body;
			const userId = req.user?._id;

			if (!url || !commissionRate || !userId) {
				res.status(400).json({
					success: false,
					error: "URL, commission rate, and user ID are required",
				});
				return;
			}

			// First analyze the URL and create offer data
			const offerData = await UrlAnalysisService.createOfferFromUrl(
				url,
				userId.toString(),
				commissionRate,
			);

			// Then use the existing affiliate service to create the offer
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
}
