import { Router } from "express";
import { RetargetingController } from "./retargeting.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { Request, Response, NextFunction } from "express";

const router = Router();

// Async handler wrapper to properly handle promises
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Get subscriber interests and categories
router.get(
  "/retargeting/subscribers/:subscriberId/interests",
  authenticate,
  asyncHandler(RetargetingController.getSubscriberInterests),
);

// Get retargeting status and recommendations
router.get(
  "/retargeting/subscribers/:subscriberId/status",
  authenticate,
  asyncHandler(RetargetingController.getRetargetingStatus),
);

// Create retargeting campaign
router.post(
  "/retargeting/subscribers/:subscriberId/campaigns",
  authenticate,
  asyncHandler(RetargetingController.createRetargetingCampaign),
);

export default router;
