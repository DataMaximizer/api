import { Request, Response } from "express";
import { logger } from "@config/logger";
import { EmailTemplateService } from "./email-template.service";

export class EmailTemplateController {
  // Get all email templates
  static async getAllTemplates(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const userId = req.user?.id;

      const result = await EmailTemplateService.getAllTemplates(
        userId,
        status as string
      );

      res.json(result);
    } catch (error) {
      logger.error("Error in getAllTemplates controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch email templates",
      });
    }
  }

  // Get single email template by ID
  static async getTemplateById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await EmailTemplateService.getTemplateById(id, userId);

      res.json(result);
    } catch (error) {
      logger.error("Error in getTemplateById controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch email template",
      });
    }
  }

  // Create new email template
  static async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const templateData = req.body;
      const userId = req.user?.id;

      const result = await EmailTemplateService.createTemplate(
        templateData,
        userId
      );

      res.status(201).json(result);
    } catch (error) {
      logger.error("Error in createTemplate controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create email template",
      });
    }
  }

  // Update email template
  static async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      const result = await EmailTemplateService.updateTemplate(
        id,
        updateData,
        userId
      );

      if (!result.success) {
        res.status(result.statusCode || 500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error("Error in updateTemplate controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update email template",
      });
    }
  }

  // Delete email template
  static async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await EmailTemplateService.deleteTemplate(id, userId);

      if (!result.success) {
        res.status(result.statusCode || 500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error("Error in deleteTemplate controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete email template",
      });
    }
  }
}
