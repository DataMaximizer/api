import { Request, Response } from "express";
import { SubscriberService } from "../services/subscriber.service";
import { logger } from "../config/logger";
import { IUser } from "../models/user.model";
import { Form } from "../models/form.model";
import { ISubscriber, Subscriber } from "../models/subscriber.model";

interface AuthRequest extends Request {
	user?: IUser;
}

export class SubscriberController {
	static async addSubscriber(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const subscriberData = {
				...req.body,
				userId: req.user._id,
				metadata: {
					...req.body.metadata,
					ip: req.ip,
					userAgent: req.headers["user-agent"],
				},
			};

			const subscriber = await SubscriberService.addSubscriber(subscriberData);
			res.status(201).json({ success: true, data: subscriber });
		} catch (error) {
			logger.error("Error in addSubscriber:", error);
			res
				.status(400)
				.json({ success: false, error: "Failed to add subscriber" });
		}
	}

	static async createList(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const listData = {
				...req.body,
				userId: req.user._id,
			};

			const list = await SubscriberService.createList(listData);
			res.status(201).json({ success: true, data: list });
		} catch (error) {
			logger.error("Error in createList:", error);
			res.status(400).json({ success: false, error: "Failed to create list" });
		}
	}

	static async getSubscribers(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const subscribers = await Subscriber.aggregate([
				{ $match: { userId: req.user._id } },
				{
					$addFields: {
						metrics: {
							$ifNull: [
								"$metrics",
								{
									opens: 0,
									clicks: 0,
									conversions: 0,
									bounces: 0,
									revenue: 0,
								},
							],
						},
						engagementScore: { $ifNull: ["$engagementScore", 0] },
					},
				},
			]);

			res.json({ success: true, data: subscribers });
		} catch (error) {
			logger.error("Error in getSubscribers:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to fetch subscribers" });
		}
	}

	static async getLists(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const lists = await SubscriberService.getLists(req.user._id.toString());
			res.json({ success: true, data: lists });
		} catch (error) {
			logger.error("Error in getLists:", error);
			res.status(500).json({ success: false, error: "Failed to fetch lists" });
		}
	}

	static async exportSubscribers(
		req: AuthRequest,
		res: Response,
	): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const { listId } = req.query;
			const subscribers = await SubscriberService.exportSubscribers(
				req.user._id.toString(),
				listId as string,
			);

			res.json({ success: true, data: subscribers });
		} catch (error) {
			logger.error("Error in exportSubscribers:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to export subscribers" });
		}
	}

	static async addPublicSubscriber(req: Request, res: Response): Promise<void> {
		try {
			const { formId, data, email, metadata } = req.body;

			// First get the form to get the userId
			const form = await Form.findById(formId);
			if (!form) {
				res.status(404).json({ success: false, error: "Form not found" });
				return;
			}

			const subscriberData: Partial<ISubscriber> = {
				formId,
				userId: form.userId,
				data,
				email,
				metadata,
				status: "active" as const, // Explicitly type as literal
				lastInteraction: new Date(),
			};

			const subscriber = await SubscriberService.addSubscriber(subscriberData);

			res.status(201).json({
				success: true,
				data: subscriber,
			});
		} catch (error) {
			logger.error("Error in addPublicSubscriber:", error);
			res.status(400).json({
				success: false,
				error: "Failed to add subscriber",
			});
		}
	}
}
