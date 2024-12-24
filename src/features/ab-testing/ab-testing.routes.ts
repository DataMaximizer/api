import { Router } from "express";
import { AbTestingController } from "./ab-testing.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";

const router = Router();

// Async handler wrapper
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const testVariantSchema = z.object({
  name: z.string().min(1, "Variant name is required"),
  content: z.string().min(1, "Content is required"),
  metadata: z.record(z.any()).optional(),
});

const createTestSchema = z.object({
  name: z.string().min(1, "Test name is required"),
  campaignId: z.string().min(1, "Campaign ID is required"),
  type: z.enum(["subject", "content", "send_time", "offer"]),
  variants: z
    .array(testVariantSchema)
    .min(2, "At least 2 variants are required"),
  winningCriteria: z.object({
    metric: z.enum(["opens", "clicks", "conversions", "revenue"]),
    minConfidence: z.number().min(0).max(100),
    minSampleSize: z.number().min(100),
  }),
  settings: z.object({
    trafficAllocation: z.number().min(1).max(100),
    testDuration: z.number().min(1), // in hours
  }),
});

const conversionSchema = z.object({
  opens: z.number().optional(),
  clicks: z.number().optional(),
  conversions: z.number().optional(),
  revenue: z.number().optional(),
});

// Test management routes
router.post(
  "/tests",
  authenticate,
  validateRequest(createTestSchema),
  asyncHandler(AbTestingController.createTest),
);

router.get("/tests", authenticate, asyncHandler(AbTestingController.getTests));

router.get(
  "/tests/:id",
  authenticate,
  asyncHandler(AbTestingController.getTestById),
);

router.post(
  "/tests/:id/start",
  authenticate,
  asyncHandler(AbTestingController.startTest),
);

router.post(
  "/tests/:id/pause",
  authenticate,
  asyncHandler(AbTestingController.pauseTest),
);

// Results and tracking routes
router.get(
  "/tests/:id/results",
  authenticate,
  asyncHandler(AbTestingController.getTestResults),
);

router.post(
  "/tests/:testId/variants/:variantId/conversions",
  authenticate,
  validateRequest(conversionSchema),
  asyncHandler(AbTestingController.trackConversion),
);

export default router;
