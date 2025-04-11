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
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const createOfferFromUrlSchema = z.object({
  url: z.string().url("Invalid URL format"),
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

router.delete("/offers/:id", authenticate, AffiliateController.deleteOffer);

router.post(
  "/generate-from-image",
  authenticate,
  upload.single("image"),
  (req, res) => AffiliateController.generateOfferFromImage(req, res)
);

router.get("/offers/report", authenticate, AffiliateController.getOfferReport);

export default router;
