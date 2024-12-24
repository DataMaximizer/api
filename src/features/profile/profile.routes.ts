import { Router, Request, Response, NextFunction } from "express";
import { ProfileController } from "./profile.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { updateProfileSchema } from "@core/utils/validators/validations/profile.validation";

const router = Router();

const handleController =
  (fn: Function) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

router.get("/", authenticate, (req, res, next) =>
  ProfileController.getProfile(req, res, next),
);

router.put(
  "/",
  authenticate,
  validateRequest(updateProfileSchema),
  (req, res, next) => ProfileController.updateProfile(req, res, next),
);

export default router;
