import { Request, Response } from "express";
import { SmsService } from "../services/sms.service";
import { logger } from "../config/logger";
import {
	SmsProvider,
	SmsTemplate,
	SmsCampaign,
} from "../models/sms-campaign.model";

export class SmsController {
	static async createProvider(req: Request, res: Response) {
		try {
			const { name, type, apiKey, apiSecret, senderId } = req.body;
			const userId = req.user?._id;

			const existingProvider = await SmsProvider.findOne({
				userId,
				name,
			});

			if (existingProvider) {
				return res.status(400).json({
					success: false,
					error: "A provider with this name already exists",
				});
			}

			const provider = await SmsProvider.create({
				name,
				type,
				apiKey,
				apiSecret,
				senderId,
				userId,
			});

			res.status(201).json({
				success: true,
				data: provider,
			});
		} catch (error) {
			logger.error("Error creating SMS provider:", error);
			res.status(500).json({
				success: false,
				error: "Failed to create SMS provider",
			});
		}
	}

	static async getProviders(req: Request, res: Response) {
		try {
			const providers = await SmsProvider.find({
				userId: req.user?._id,
			}).select("-apiKey -apiSecret");

			res.json({
				success: true,
				data: providers,
			});
		} catch (error) {
			logger.error("Error fetching SMS providers:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch SMS providers",
			});
		}
	}

	static async createTemplate(req: Request, res: Response) {
		try {
			const templateData = {
				...req.body,
				userId: req.user?._id,
			};

			const template = await SmsService.createTemplate(templateData);

			res.status(201).json({
				success: true,
				data: template,
			});
		} catch (error) {
			logger.error("Error creating SMS template:", error);
			res.status(500).json({
				success: false,
				error: "Failed to create SMS template",
			});
		}
	}

	static async getTemplates(req: Request, res: Response) {
		try {
			const templates = await SmsTemplate.find({ userId: req.user?._id });

			res.json({
				success: true,
				data: templates,
			});
		} catch (error) {
			logger.error("Error fetching SMS templates:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch SMS templates",
			});
		}
	}

	static async createCampaign(req: Request, res: Response) {
		try {
			const campaignData = {
				...req.body,
				userId: req.user?._id,
			};

			const campaign = await SmsService.createCampaign(campaignData);

			res.status(201).json({
				success: true,
				data: campaign,
			});
		} catch (error) {
			logger.error("Error creating SMS campaign:", error);
			res.status(500).json({
				success: false,
				error: "Failed to create SMS campaign",
			});
		}
	}

	static async getCampaigns(req: Request, res: Response) {
		try {
			const { status, page = 1, limit = 10 } = req.query;
			const query: any = { userId: req.user?._id };

			if (status) {
				query.status = status;
			}

			const campaigns = await SmsCampaign.find(query)
				.sort({ createdAt: -1 })
				.skip((Number(page) - 1) * Number(limit))
				.limit(Number(limit))
				.populate("template", "name")
				.populate("provider", "name");

			const total = await SmsCampaign.countDocuments(query);

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
			logger.error("Error fetching SMS campaigns:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch SMS campaigns",
			});
		}
	}

	static async sendTestSMS(req: Request, res: Response) {
		try {
			const { providerId, to, content } = req.body;

			const messageId = await SmsService.sendSMS({
				providerId,
				to,
				content,
			});

			res.json({
				success: true,
				data: { messageId },
			});
		} catch (error) {
			logger.error("Error sending test SMS:", error);
			res.status(500).json({
				success: false,
				error: "Failed to send test SMS",
			});
		}
	}

	static async executeCampaign(req: Request, res: Response) {
		try {
			const { id } = req.params;

			await SmsService.executeCampaign(id);

			res.json({
				success: true,
				message: "Campaign execution started",
			});
		} catch (error) {
			logger.error("Error executing SMS campaign:", error);
			res.status(500).json({
				success: false,
				error: "Failed to execute SMS campaign",
			});
		}
	}
}
