import { Request, Response, NextFunction } from "express";
import { CampaignService } from "../services/campaign.service";
import { Campaign } from "../models/campaign.model";

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

	static async getCampaigns(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const { status, type, page = 1, limit = 10 } = req.query;
			const query: any = { userId: req.user?._id };

			if (status) query.status = status;
			if (type) query.type = type;

			const campaigns = await Campaign.find(query)
				.sort({ createdAt: -1 })
				.skip((Number(page) - 1) * Number(limit))
				.limit(Number(limit))
				.populate("smtpProviderId", "name");

			const total = await Campaign.countDocuments(query);

			res.json({
				success: true,
				data: campaigns,
				pagination: {
					total,
					page: Number(page),
					pages: Math.ceil(total / Number(limit)),
				},
			});
		} catch (error) {
			next(error);
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

	static async updateStatus(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const { status } = req.body;
			await CampaignService.updateCampaignStatus(req.params.id, status);

			res.json({
				success: true,
				message: "Campaign status updated successfully",
			});
		} catch (error) {
			next(error);
		}
	}
}