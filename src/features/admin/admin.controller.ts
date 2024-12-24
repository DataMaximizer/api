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
}

export const adminController = new AdminController();
