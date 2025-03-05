import { Router } from "express";
import { AnalyticsController } from "./analytics.controller";
import { authenticate } from "@core/middlewares/auth.middleware";

const router = Router();

router.get("/revenue", authenticate, AnalyticsController.getRevenue as any);

export default router;
