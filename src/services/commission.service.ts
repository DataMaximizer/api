import {
	Commission,
	Payout,
	CommissionRule,
	ICommissionRule,
} from "../models/commission.model";
import { AffiliateOffer } from "../models/affiliate-offer.model";
import { User } from "../models/user.model";
import { logger } from "../config/logger";
import Stripe from "stripe";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
// 	apiVersion: "2023-10-16",
// });

export class CommissionService {
	static async calculateCommission(
		offerId: string,
		amount: number,
		userId: string,
	): Promise<number> {
		try {
			const offer = await AffiliateOffer.findById(offerId);
			if (!offer) throw new Error("Offer not found");

			const commissionRule = await CommissionRule.findOne({
				offerId,
				isActive: true,
			});

			if (!commissionRule) {
				return offer.isAdminOffer
					? this.calculateAdminCommission(amount, offer.commissionRate)
					: this.calculateUserCommission(amount, offer.commissionRate);
			}

			return this.applyCommissionRule(amount, commissionRule);
		} catch (error) {
			logger.error("Error calculating commission:", error);
			throw error;
		}
	}

	private static calculateAdminCommission(
		amount: number,
		commissionRate: number,
	): number {
		return (amount * commissionRate) / 100;
	}

	private static calculateUserCommission(
		amount: number,
		commissionRate: number,
	): number {
		// User gets 80% of the commission by default
		return (amount * commissionRate * 0.8) / 100;
	}

	private static applyCommissionRule(
		amount: number,
		rule: ICommissionRule,
	): number {
		if (rule.type === "fixed") {
			return rule.value;
		}

		const commission = (amount * rule.value) / 100;

		if (rule.minAmount && commission < rule.minAmount) {
			return rule.minAmount;
		}

		if (rule.maxAmount && commission > rule.maxAmount) {
			return rule.maxAmount;
		}

		return commission;
	}

	static async trackConversion(
		offerId: string,
		userId: string,
		conversionData: {
			conversionId: string;
			amount: number;
			currency: string;
			metadata?: Record<string, any>;
		},
	): Promise<void> {
		try {
			const commissionAmount = await this.calculateCommission(
				offerId,
				conversionData.amount,
				userId,
			);

			await Commission.create({
				userId,
				offerId,
				conversionId: conversionData.conversionId,
				amount: conversionData.amount,
				commissionAmount,
				currency: conversionData.currency,
				status: "pending",
				metadata: conversionData.metadata,
			});
		} catch (error) {
			logger.error("Error tracking conversion:", error);
			throw error;
		}
	}

	static async generatePayouts(date = new Date()): Promise<void> {
		try {
			// Find all unpaid commissions
			const unpaidCommissions = await Commission.find({
				status: "approved",
				payoutId: { $exists: false },
			}).populate("userId");

			// Group commissions by user
			const userCommissions = unpaidCommissions.reduce(
				(acc, commission) => {
					const userId = commission.userId.toString();
					if (!acc[userId]) {
						acc[userId] = [];
					}
					acc[userId].push(commission);
					return acc;
				},
				{} as Record<string, any[]>,
			);

			// Create payouts for each user
			for (const [userId, commissions] of Object.entries(userCommissions)) {
				const totalAmount = commissions.reduce(
					(sum, commission) => sum + commission.commissionAmount,
					0,
				);

				if (totalAmount < 100) continue; // Minimum payout threshold

				const user = await User.findById(userId);
				if (!user) continue;

				const payout = await Payout.create({
					userId,
					amount: totalAmount,
					currency: "USD", // Default currency
					status: "pending",
					commissions: commissions.map((c) => c._id),
					scheduledDate: date,
				});

				// Update commission records
				await Commission.updateMany(
					{ _id: { $in: commissions.map((c) => c._id) } },
					{
						$set: {
							payoutId: payout._id,
							status: "pending_payout",
						},
					},
				);
			}
		} catch (error) {
			logger.error("Error generating payouts:", error);
			throw error;
		}
	}

	static async processPayout(payoutId: string): Promise<void> {
		try {
			const payout = await Payout.findById(payoutId).populate("userId");
			if (!payout) throw new Error("Payout not found");

			const user = await User.findById(payout.userId);
			if (!user) throw new Error("User not found");

			// Create Stripe payout
			const stripePayout = await stripe.payouts.create({
				amount: Math.round(payout.amount * 100), // Convert to cents
				currency: payout.currency,
				destination: user.stripeAccountId, // Assuming user has connected Stripe account
			});

			// Update payout record
			await Payout.findByIdAndUpdate(payoutId, {
				status: "processing",
				stripePayoutId: stripePayout.id,
				processedDate: new Date(),
			});
		} catch (error) {
			logger.error("Error processing payout:", error);

			// Update payout status to failed
			await Payout.findByIdAndUpdate(payoutId, {
				status: "failed",
				metadata: { error: error.message },
			});

			throw error;
		}
	}

	static async getCommissionStats(userId: string): Promise<any> {
		try {
			const pipeline = [
				{ $match: { userId, status: { $in: ["approved", "paid"] } } },
				{
					$group: {
						_id: null,
						totalCommissions: { $sum: "$commissionAmount" },
						totalConversions: { $sum: 1 },
						averageCommission: { $avg: "$commissionAmount" },
						totalRevenue: { $sum: "$amount" },
					},
				},
			];

			const [stats] = await Commission.aggregate(pipeline);
			return (
				stats || {
					totalCommissions: 0,
					totalConversions: 0,
					averageCommission: 0,
					totalRevenue: 0,
				}
			);
		} catch (error) {
			logger.error("Error getting commission stats:", error);
			throw error;
		}
	}
}
