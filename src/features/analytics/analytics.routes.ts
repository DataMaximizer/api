import { Router } from "express";
import { AnalyticsController } from "./analytics.controller";
import { authenticate } from "@core/middlewares/auth.middleware";

const router = Router();

router.get("/revenue", authenticate, AnalyticsController.getRevenue as any);
router.get(
  "/email",
  authenticate,
  AnalyticsController.getEmailAnalytics as any
);
router.get(
  "/subscribers",
  authenticate,
  AnalyticsController.getSubscriberAnalytics as any
);

export default router;
