import { Router } from "express";
import { SubscriberController } from "../controllers/subscriber.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import {
	createSubscriberSchema,
	createListSchema,
	updateListSchema,
} from "../utils/subscriber.validation";

const router = Router();

// Subscribers
router.post(
	"/",
	authenticate,
	validateRequest(createSubscriberSchema),
	SubscriberController.addSubscriber,
);

router.get("/", authenticate, SubscriberController.getSubscribers);

// Lists
router.post(
	"/lists",
	authenticate,
	validateRequest(createListSchema),
	SubscriberController.createList,
);

router.get("/lists", authenticate, SubscriberController.getLists);

// Export
router.get("/export", authenticate, SubscriberController.exportSubscribers);

export default router;
