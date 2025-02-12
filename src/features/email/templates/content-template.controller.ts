import { Request, Response } from "express";
import { ContentTemplate } from "@features/ai/models/ai-content.model";
import { logger } from "@config/logger";

export class ContentTemplateController {
	static async getAllTemplates(req: Request, res: Response) {
		try {
			const templates = await ContentTemplate.find().lean();

			res.json({
				success: true,
				data: templates,
			});
		} catch (error) {
			logger.error("Error fetching content templates:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch content templates",
			});
		}
	}
}

