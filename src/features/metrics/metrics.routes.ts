import { Router } from "express";
import { MetricsController } from "./metrics.controller";
import { authenticate } from "@core/middlewares/auth.middleware";

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

router.get(
  "/subscribers",
  authenticate,
  MetricsController.getSubscriberMetrics,
);

export default router;
