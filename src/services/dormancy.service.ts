import { Subscriber } from "../models/subscriber.model";
import { Campaign, ICampaign } from "../models/campaign.model";
import { Types } from "mongoose";
import { logger } from "../config/logger";

interface DormancyThresholds {
	mild: number;
	moderate: number;
	severe: number;
	terminal: number;
}

interface DormancyStats {
	status: "active" | "mild" | "moderate" | "severe" | "terminal";
	daysSinceLastInteraction: number;
	lastInteractionType?: string;
	lastCampaignDate?: Date;
	reengagementAttempts: number;
	recommendedAction: string;
}

export class DormancyService {
	private static readonly THRESHOLDS: DormancyThresholds = {
		mild: 30,
		moderate: 60,
		severe: 90,
		terminal: 120,
	};

	private static readonly MAX_REENGAGEMENT_ATTEMPTS = 3;

	static async analyzeDormancy(subscriberId: string): Promise<DormancyStats> {
		try {
			const subscriber = await Subscriber.findById(subscriberId).lean();
			if (!subscriber) throw new Error("Subscriber not found");

			const lastInteraction =
				subscriber.lastInteraction || subscriber.createdAt;
			const daysSinceLastInteraction = Math.floor(
				(Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24),
			);

			// Get last interaction details
			const lastInteractionRecord = subscriber.metrics?.interactions?.sort(
				(a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
			)[0];

			// Get reengagement attempts
			const reengagementAttempts = await Campaign.countDocuments({
				segments: new Types.ObjectId(subscriberId),
				"settings.isReengagement": true,
				createdAt: { $gt: lastInteraction },
			});

			const status = this.getDormancyStatus(daysSinceLastInteraction);
			const recommendedAction = this.getRecommendedAction(
				status,
				reengagementAttempts,
				subscriber.engagementScore,
			);

			return {
				status,
				daysSinceLastInteraction,
				lastInteractionType: lastInteractionRecord?.type,
				lastCampaignDate: lastInteractionRecord?.timestamp,
				reengagementAttempts,
				recommendedAction,
			};
		} catch (error) {
			logger.error("Error analyzing dormancy:", error);
			throw error;
		}
	}

	private static getDormancyStatus(
		days: number,
	): "active" | "mild" | "moderate" | "severe" | "terminal" {
		if (days < this.THRESHOLDS.mild) return "active";
		if (days < this.THRESHOLDS.moderate) return "mild";
		if (days < this.THRESHOLDS.severe) return "moderate";
		if (days < this.THRESHOLDS.terminal) return "severe";
		return "terminal";
	}

	private static getRecommendedAction(
		status: string,
		reengagementAttempts: number,
		engagementScore: number,
	): string {
		if (status === "active") return "Continue regular campaigns";
		if (reengagementAttempts >= this.MAX_REENGAGEMENT_ATTEMPTS) {
			return "Remove from active campaigns";
		}

		switch (status) {
			case "mild":
				return "Send personalized re-engagement campaign";
			case "moderate":
				return engagementScore > 30
					? "Send final re-engagement offer"
					: "Consider removing from active campaigns";
			case "severe":
				return "Send last chance re-activation email";
			case "terminal":
				return "Remove from email list";
			default:
				return "Review manually";
		}
	}

	static async createReengagementCampaign(
		subscriberId: string,
		userId: string,
	): Promise<ICampaign | null> {
		try {
			const dormancyStats = await this.analyzeDormancy(subscriberId);

			if (
				dormancyStats.status === "terminal" ||
				dormancyStats.reengagementAttempts >= this.MAX_REENGAGEMENT_ATTEMPTS
			) {
				return null;
			}

			const subscriber = await Subscriber.findById(subscriberId);
			if (!subscriber) throw new Error("Subscriber not found");

			const campaign = await Campaign.create({
				name: `Re-engagement - ${subscriber.email}`,
				type: "email",
				userId: new Types.ObjectId(userId),
				segments: [new Types.ObjectId(subscriberId)],
				status: "draft",
				settings: {
					isReengagement: true,
					dormancyLevel: dormancyStats.status,
					attemptNumber: dormancyStats.reengagementAttempts + 1,
				},
			});

			return campaign;
		} catch (error) {
			logger.error("Error creating reengagement campaign:", error);
			throw error;
		}
	}

	static async handleDormantSubscribers(userId: string): Promise<void> {
		try {
			const subscribers = await Subscriber.find({
				userId: new Types.ObjectId(userId),
				status: "active",
				lastInteraction: {
					$lt: new Date(
						Date.now() - this.THRESHOLDS.terminal * 24 * 60 * 60 * 1000,
					),
				},
			});

			for (const subscriber of subscribers) {
				const stats = await this.analyzeDormancy(subscriber._id.toString());

				if (stats.status === "terminal") {
					await Subscriber.findByIdAndUpdate(subscriber._id, {
						status: "inactive",
						metadata: {
							...subscriber.metadata,
							inactivationReason: "dormancy",
							inactivationDate: new Date(),
						},
					});

					logger.info(
						`Marked subscriber ${subscriber._id} as inactive due to dormancy`,
					);
				}
			}
		} catch (error) {
			logger.error("Error handling dormant subscribers:", error);
			throw error;
		}
	}

	static async getDormancyReport(userId: string) {
		try {
			const subscribers = await Subscriber.find({
				userId: new Types.ObjectId(userId),
			});

			const dormancyStats = {
				active: 0,
				mild: 0,
				moderate: 0,
				severe: 0,
				terminal: 0,
				totalReengagementAttempts: 0,
				successfulReengagements: 0,
			};

			for (const subscriber of subscribers) {
				const stats = await this.analyzeDormancy(subscriber._id.toString());
				dormancyStats[stats.status]++;
				dormancyStats.totalReengagementAttempts += stats.reengagementAttempts;

				if (stats.reengagementAttempts > 0 && stats.status === "active") {
					dormancyStats.successfulReengagements++;
				}
			}

			return {
				...dormancyStats,
				reengagementSuccessRate:
					dormancyStats.totalReengagementAttempts > 0
						? (dormancyStats.successfulReengagements /
								dormancyStats.totalReengagementAttempts) *
							100
						: 0,
			};
		} catch (error) {
			logger.error("Error generating dormancy report:", error);
			throw error;
		}
	}
}
