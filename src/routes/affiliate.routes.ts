import { Router } from "express";
import { AffiliateController } from "../controllers/affiliate.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import {
	createOfferSchema,
	updateOfferSchema,
} from "../utils/affiliate.validation";
import { UserType } from "../models/user.model";

const router = Router();

router.post(
	"/offers",
	authenticate,
	validateRequest(createOfferSchema),
	AffiliateController.createOffer,
);

router.get("/offers", authenticate, AffiliateController.getOffers);

router.put(
	"/offers/:id",
	authenticate,
	validateRequest(updateOfferSchema),
	AffiliateController.updateOffer,
);

router.post(
	"/offers/validate",
	authenticate,
	authorize([UserType.OWNER]),
	AffiliateController.validateOffers,
);

export default router;
