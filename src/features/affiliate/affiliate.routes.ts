import { Router } from "express";
import { AffiliateController } from "./affiliate.controller";
import { authenticate, authorize } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import {
  createOfferSchema,
  updateOfferSchema,
} from "@core/utils/validators/validations/affiliate.validation";

import { UrlAnalysisController } from "@features/url-analysis/url-analysis.controller";

import { z } from "zod";
import { UserType } from "@features/user/models/user.model";

const router = Router();

const createOfferFromUrlSchema = z.object({
  url: z.string().url("Invalid URL format"),
  commissionRate: z
    .number()
    .min(0)
    .max(100, "Commission rate must be between 0 and 100"),
});

router.post(
  "/offers",
  authenticate,
  validateRequest(createOfferSchema),
  AffiliateController.createOffer
);

router.get("/offers", authenticate, AffiliateController.getOffers);

router.put(
  "/offers/:id",
  authenticate,
  validateRequest(updateOfferSchema),
  AffiliateController.updateOffer
);

router.post(
  "/offers/validate",
  authenticate,
  authorize([UserType.OWNER]),
  AffiliateController.validateOffers
);

router.post(
  "/analyze-url",
  authenticate,
  validateRequest(createOfferFromUrlSchema),
  (req, res, next) => UrlAnalysisController.createOfferFromUrl(req, res, next)
);

router.delete(
  "/analyze-url/:id",
  authenticate,
  authorize([UserType.OWNER]),
  AffiliateController.deleteAnalyzedUrl
);

export default router;
