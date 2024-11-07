import { Request, Response } from "express";
import { SubscriberService } from "../services/subscriber.service";
import { logger } from "../config/logger";
import { IUser } from "../models/user.model";

interface AuthRequest extends Request {
	user?: IUser;
}

export class SubscriberController {
	static async addSubscriber(req: AuthRequest, res: Response) {
		try {
			if (!req.user?._id) {
				return res.status(401).json({ success: false, error: "Unauthorized" });
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

	static async createList(req: AuthRequest, res: Response) {
		try {
			if (!req.user?._id) {
				return res.status(401).json({ success: false, error: "Unauthorized" });
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

	static async getSubscribers(req: AuthRequest, res: Response) {
		try {
			if (!req.user?._id) {
				return res.status(401).json({ success: false, error: "Unauthorized" });
			}

			const subscribers = await SubscriberService.getSubscribers(
				req.user._id.toString(),
				req.query,
			);
			res.json({ success: true, data: subscribers });
		} catch (error) {
			logger.error("Error in getSubscribers:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to fetch subscribers" });
		}
	}

	static async getLists(req: AuthRequest, res: Response) {
		try {
			if (!req.user?._id) {
				return res.status(401).json({ success: false, error: "Unauthorized" });
			}

			const lists = await SubscriberService.getLists(req.user._id.toString());
			res.json({ success: true, data: lists });
		} catch (error) {
			logger.error("Error in getLists:", error);
			res.status(500).json({ success: false, error: "Failed to fetch lists" });
		}
	}

	static async exportSubscribers(req: AuthRequest, res: Response) {
		try {
			if (!req.user?._id) {
				return res.status(401).json({ success: false, error: "Unauthorized" });
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
}
