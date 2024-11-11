import { Router } from "express";
import { CommissionController } from "../controllers/commission.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { z } from "zod";

const router = Router();

const commissionRuleSchema = z.object({
	offerId: z.string().min(1, "Offer ID is required"),
	type: z.enum(["fixed", "percentage"]),
	value: z.number().min(0),
	minAmount: z.number().optional(),
	maxAmount: z.number().optional(),
});

const updateCommissionStatusSchema = z.object({
	status: z.enum(["pending", "approved", "rejected", "paid"]),
});

// Commission routes
router.get("/commissions", authenticate, CommissionController.getCommissions);
router.get(
	"/commissions/stats",
	authenticate,
	CommissionController.getCommissionStats,
);
router.patch(
	"/commissions/:id/status",
	authenticate,
	validateRequest(updateCommissionStatusSchema),
	CommissionController.updateCommissionStatus,
);

// Commission rules
router.post(
	"/rules",
	authenticate,
	validateRequest(commissionRuleSchema),
	CommissionController.createCommissionRule,
);

// Payout routes
router.get("/payouts", authenticate, CommissionController.getPayouts);
router.post(
	"/payouts/request",
	authenticate,
	CommissionController.requestPayout,
);

export default router;
