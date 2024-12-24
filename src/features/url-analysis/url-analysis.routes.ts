import { Router } from "express";
import { UrlAnalysisController } from "./url-analysis.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { z } from "zod";

const router = Router();

const createOfferFromUrlSchema = z.object({
  url: z.string().url("Invalid URL format"),
  commissionRate: z
    .number()
    .min(0)
    .max(100, "Commission rate must be between 0 and 100"),
});

router.post(
  "/analyze-url",
  authenticate,
  validateRequest(createOfferFromUrlSchema),
  (req, res, next) => UrlAnalysisController.createOfferFromUrl(req, res, next),
);

router.delete("/analyze-url/:id", authenticate, (req, res, next) => {
  UrlAnalysisController.deleteAnalysis(req, res, next);
});

export default router;
