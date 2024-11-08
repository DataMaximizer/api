import { Router } from "express";
import { MetricsController } from "../controllers/metrics.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.post(
	"/track/open/:subscriberId",
	authenticate,
	MetricsController.trackOpen,
);
router.post(
	"/track/click/:subscriberId",
	authenticate,
	MetricsController.trackClick,
);
router.post(
	"/track/conversion/:subscriberId",
	authenticate,
	MetricsController.trackConversion,
);
router.post(
	"/track/bounce/:subscriberId",
	authenticate,
	MetricsController.trackBounce,
);

export default router;
