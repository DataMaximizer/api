import { Request, Response } from "express";
import { AdminService } from "./admin.service";
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
}

export const adminController = new AdminController();
