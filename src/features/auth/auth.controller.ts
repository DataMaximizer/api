import { Request, Response } from "express";
import { AuthService } from "@features/auth/auth.service";
import { CacheService } from "@core/services/cache.service";

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { user } = await AuthService.register(req.body);

      // Invalidate users list cache after registration
      await CacheService.delByPattern("users:list:*");

      res.status(201).json({
        user,
        message:
          "Registration successful. Please check your email for activation instructions.",
      });
    } catch (error) {
      // @ts-ignore
      res.status(400).json({ error: error.message });
    }
  }

  static async activateAccount(req: Request, res: Response) {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({ error: "Token and password are required" });
        return;
      }

      const { user, accessToken } = await AuthService.activateAccount(
        token,
        password
      );

      res.json({
        user,
        token: accessToken,
        message: "Account activated successfully",
      });
    } catch (error) {
      // @ts-ignore
      res.status(400).json({ error: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await AuthService.login(
        email,
        password
      );
      res.json({ user, token: accessToken });
    } catch (error) {
      // @ts-ignore
      res.status(401).json({ error: error.message });
    }
  }
}
