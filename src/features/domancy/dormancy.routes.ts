import { Router } from "express";
import { DormancyController } from "@features/domancy/dormancy.controller";
import { authenticate, authorize } from "@core/middlewares/auth.middleware";
import { UserType } from "@features/user/models/user.model";
import { Request, Response, NextFunction } from "express";

const router = Router();

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Get dormancy status for a subscriber
router.get(
  "/dormancy/subscribers/:subscriberId",
  authenticate,
  asyncHandler(DormancyController.getDormancyStatus),
);

// Create re-engagement campaign
router.post(
  "/dormancy/subscribers/:subscriberId/reengagement",
  authenticate,
  asyncHandler(DormancyController.createReengagementCampaign),
);

// Get dormancy report
router.get(
  "/dormancy/report",
  authenticate,
  asyncHandler(DormancyController.getDormancyReport),
);

// Process dormant subscribers (admin only)
router.post(
  "/dormancy/process",
  authenticate,
  authorize([UserType.OWNER]),
  asyncHandler(DormancyController.handleDormantSubscribers),
);

export default router;
