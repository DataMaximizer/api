import { Request, Response } from "express";
import { CommissionService } from "../services/commission.service";
import { Commission, Payout, CommissionRule } from "../models/commission.model";
import { logger } from "../config/logger";

export class CommissionController {
	static async getCommissions(req: Request, res: Response) {
		try {
			const {
				status,
				offerId,
				startDate,
				endDate,
				page = 1,
				limit = 10,
			} = req.query;
			const query: any = { userId: req.user?._id };

			if (status) query.status = status;
			if (offerId) query.offerId = offerId;
			if (startDate || endDate) {
				query.createdAt = {};
				if (startDate) query.createdAt.$gte = new Date(startDate as string);
				if (endDate) query.createdAt.$lte = new Date(endDate as string);
			}

			const commissions = await Commission.find(query)
				.sort({ createdAt: -1 })
				.skip((Number(page) - 1) * Number(limit))
				.limit(Number(limit))
				.populate("offerId", "name");

			const total = await Commission.countDocuments(query);

			res.json({
				success: true,
				data: commissions,
				pagination: {
					total,
					page: Number(page),
					pages: Math.ceil(total / Number(limit)),
				},
			});
		} catch (error) {
			logger.error("Error fetching commissions:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch commissions",
			});
		}
	}

	static async getPayouts(req: Request, res: Response) {
		try {
			const { status, page = 1, limit = 10 } = req.query;
			const query: any = { userId: req.user?._id };

			if (status) query.status = status;

			const payouts = await Payout.find(query)
				.sort({ createdAt: -1 })
				.skip((Number(page) - 1) * Number(limit))
				.limit(Number(limit));

			const total = await Payout.countDocuments(query);

			res.json({
				success: true,
				data: payouts,
				pagination: {
					total,
					page: Number(page),
					pages: Math.ceil(total / Number(limit)),
				},
			});
		} catch (error) {
			logger.error("Error fetching payouts:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch payouts",
			});
		}
	}

	static async getCommissionStats(req: Request, res: Response) {
		try {
			const stats = await CommissionService.getCommissionStats(req.user?._id);

			res.json({
				success: true,
				data: stats,
			});
		} catch (error) {
			logger.error("Error fetching commission stats:", error);
			res.status(500).json({
				success: false,
				error: "Failed to fetch commission stats",
			});
		}
	}

	static async createCommissionRule(req: Request, res: Response) {
		try {
			const { offerId, type, value, minAmount, maxAmount } = req.body;

			// Check if rule already exists
			const existingRule = await CommissionRule.findOne({
				offerId,
				isActive: true,
			});

			if (existingRule) {
				// Deactivate existing rule
				await CommissionRule.findByIdAndUpdate(existingRule._id, {
					isActive: false,
				});
			}

			const rule = await CommissionRule.create({
				offerId,
				type,
				value,
				minAmount,
				maxAmount,
				userId: req.user?._id,
				isActive: true,
			});

			res.status(201).json({
				success: true,
				data: rule,
			});
		} catch (error) {
			logger.error("Error creating commission rule:", error);
			res.status(500).json({
				success: false,
				error: "Failed to create commission rule",
			});
		}
	}

	static async updateCommissionStatus(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { status } = req.body;

			const commission = await Commission.findOneAndUpdate(
				{ _id: id, userId: req.user?._id },
				{ status },
				{ new: true },
			);

			if (!commission) {
				return res.status(404).json({
					success: false,
					error: "Commission not found",
				});
			}

			res.json({
				success: true,
				data: commission,
			});
		} catch (error) {
			logger.error("Error updating commission status:", error);
			res.status(500).json({
				success: false,
				error: "Failed to update commission status",
			});
		}
	}

	static async requestPayout(req: Request, res: Response) {
		try {
			const unpaidCommissions = await Commission.find({
				userId: req.user?._id,
				status: "approved",
				payoutId: { $exists: false },
			});

			if (unpaidCommissions.length === 0) {
				return res.status(400).json({
					success: false,
					error: "No approved commissions available for payout",
				});
			}

			const totalAmount = unpaidCommissions.reduce(
				(sum, commission) => sum + commission.commissionAmount,
				0,
			);

			if (totalAmount < 100) {
				return res.status(400).json({
					success: false,
					error: "Minimum payout threshold not met (100 USD)",
				});
			}

			const payout = await Payout.create({
				userId: req.user?._id,
				amount: totalAmount,
				currency: "USD",
				status: "pending",
				commissions: unpaidCommissions.map((c) => c._id),
				scheduledDate: new Date(),
			});

			await Commission.updateMany(
				{ _id: { $in: unpaidCommissions.map((c) => c._id) } },
				{
					$set: {
						payoutId: payout._id,
						status: "pending_payout",
					},
				},
			);

			res.status(201).json({
				success: true,
				data: payout,
			});
		} catch (error) {
			logger.error("Error requesting payout:", error);
			res.status(500).json({
				success: false,
				error: "Failed to request payout",
			});
		}
	}
}
