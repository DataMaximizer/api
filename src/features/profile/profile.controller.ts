import { Request, Response, NextFunction } from "express";
import { User } from "@features/user/models/user.model";
import { logger } from "@config/logger";

export class ProfileController {
  static async getProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = await User.findById(req.user?._id).select("-password");

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error("Error fetching profile:", error);
      next(error);
    }
  }

  static async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { password, type, ...updateData } = req.body;

      const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: updateData },
        { new: true }
      ).select("-password");

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error("Error updating profile:", error);
      next(error);
    }
  }
}
