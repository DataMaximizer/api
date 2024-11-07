import { Request, Response, NextFunction } from "express";
import { AIConfigService } from "../services/ai-config.service";
import { logger } from "../config/logger";
import { IUser } from "../models/user.model";

// Define extended Request type with user
interface AuthRequest extends Request {
	user?: IUser;
}

export class AIConfigController {
	static async getConfig(
		req: AuthRequest,
		res: Response,
		next: NextFunction,
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
		next: NextFunction,
	): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const isValidApiKey = await AIConfigService.validateApiKey(
				req.body.provider,
				req.body.apiKey,
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
				req.body,
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
		next: NextFunction,
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
		next: NextFunction,
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
}
