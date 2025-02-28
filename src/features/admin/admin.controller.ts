import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { UserService } from "@features/user/user.service";
import { logger } from "@config/logger";

class AdminController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AdminService.login(email, password);
      res.json(result);
    } catch (error) {
      logger.error("Admin login error:", error);
      res.status(401).json({ error: "Invalid credentials" });
    }
  }

  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      // For now, returning a simple response
      res.json({ message: "Dashboard data retrieved" });
    } catch (error) {
      logger.error("Error getting dashboard:", error);
      res.status(500).json({ error: "Failed to get dashboard data" });
    }
  }

  async getSystemSettings(req: Request, res: Response): Promise<void> {
    try {
      // For now, returning a simple response
      res.json({ message: "System settings retrieved" });
    } catch (error) {
      logger.error("Error getting system settings:", error);
      res.status(500).json({ error: "Failed to get system settings" });
    }
  }

  async getApiKeys(req: Request, res: Response): Promise<void> {
    try {
      // Get user ID from the authenticated request
      const userId = req.user?._id as string;

      // Fetch API keys using the UserService
      const apiKeys = await UserService.getUserApiKeys(userId);

      res.json(apiKeys);
    } catch (error) {
      logger.error("Error getting API keys:", error);
      res.status(500).json({ error: "Failed to get API keys" });
    }
  }

  async updateApiKeys(req: Request, res: Response): Promise<void> {
    try {
      // Get user ID from the authenticated request
      const userId = req.user?._id as string;

      // Get the API keys from the request body
      const { openAiKey, claudeKey } = req.body;

      // Update the user's API keys
      const result = await UserService.updateUserApiKeys(userId, {
        openAiKey,
        claudeKey,
      });

      res.json({ message: "API keys updated successfully", data: result });
    } catch (error) {
      logger.error("Error updating API keys:", error);
      res.status(500).json({ error: "Failed to update API keys" });
    }
  }
}

export const adminController = new AdminController();
