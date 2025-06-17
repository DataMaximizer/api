import { Request, Response } from "express";
import { AutomationService } from "./automation.service";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";

interface AuthRequest extends Request {
  user?: IUser;
}

export class AutomationController {
  static async createAutomation(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const automation = await AutomationService.createAutomation({
        ...req.body,
        userId: req.user._id,
      });

      res.status(201).json({ success: true, data: automation });
    } catch (error) {
      logger.error("Error creating automation:", error);
      res
        .status(400)
        .json({ success: false, error: "Failed to create automation" });
    }
  }

  static async getAutomations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const automations = await AutomationService.getAutomations(
        req.user._id.toString()
      );
      res.json({ success: true, data: automations });
    } catch (error) {
      logger.error("Error fetching automations:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch automations" });
    }
  }

  static async getAutomation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const automation = await AutomationService.getAutomationById(
        req.params.id,
        req.user._id.toString()
      );

      if (!automation) {
        res.status(404).json({ success: false, error: "Automation not found" });
        return;
      }

      res.json({ success: true, data: automation });
    } catch (error) {
      logger.error("Error fetching automation:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch automation" });
    }
  }

  static async updateAutomation(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const updated = await AutomationService.updateAutomation(
        req.params.id,
        req.user._id.toString(),
        req.body
      );

      if (!updated) {
        res.status(404).json({ success: false, error: "Automation not found" });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error("Error updating automation:", error);
      res
        .status(400)
        .json({ success: false, error: "Failed to update automation" });
    }
  }

  static async deleteAutomation(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      await AutomationService.deleteAutomation(
        req.params.id,
        req.user._id.toString()
      );
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting automation:", error);
      res
        .status(400)
        .json({ success: false, error: "Failed to delete automation" });
    }
  }
}
