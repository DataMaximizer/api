import { Router, Request, Response, NextFunction } from "express";
import { ProfileController } from "../controllers/profile.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { updateProfileSchema } from "../utils/profile.validation";

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
