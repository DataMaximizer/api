import { Subscriber } from "../models/subscriber.model";
import { logger } from "../config/logger";

export class MetricsTrackingService {
	static async trackOpen(subscriberId: string, campaignId?: string) {
		try {
			await Subscriber.findByIdAndUpdate(
				subscriberId,
				{
					$inc: { "metrics.opens": 1 },
					$set: {
						lastInteraction: new Date(),
						"metrics.lastOpen": new Date(),
					},
					$push: {
						"metrics.interactions": {
							type: "open",
							campaignId,
							timestamp: new Date(),
						},
					},
				},
				{ upsert: false },
			);
		} catch (error) {
			logger.error(
				`Error tracking open for subscriber ${subscriberId}:`,
				error,
			);
			throw error;
		}
	}

	static async trackClick(
		subscriberId: string,
		linkId: string,
		campaignId?: string,
	) {
		try {
			await Subscriber.findByIdAndUpdate(subscriberId, {
				$inc: { "metrics.clicks": 1 },
				$set: {
					lastInteraction: new Date(),
					"metrics.lastClick": new Date(),
				},
				$push: {
					"metrics.interactions": {
						type: "click",
						linkId,
						campaignId,
						timestamp: new Date(),
					},
				},
			});
		} catch (error) {
			logger.error(
				`Error tracking click for subscriber ${subscriberId}:`,
				error,
			);
			throw error;
		}
	}

	static async trackConversion(
		subscriberId: string,
		amount: number,
		productId: string,
	) {
		try {
			await Subscriber.findByIdAndUpdate(subscriberId, {
				$inc: {
					"metrics.conversions": 1,
					"metrics.revenue": amount,
				},
				$set: { lastInteraction: new Date() },
				$push: {
					"metrics.interactions": {
						type: "conversion",
						productId,
						amount,
						timestamp: new Date(),
					},
				},
			});
		} catch (error) {
			logger.error(
				`Error tracking conversion for subscriber ${subscriberId}:`,
				error,
			);
			throw error;
		}
	}

	static async trackBounce(
		subscriberId: string,
		bounceType: "hard" | "soft",
		reason: string,
	) {
		try {
			const subscriber = await Subscriber.findById(subscriberId);
			if (!subscriber) return;

			const bounceCount = (subscriber.metrics?.bounces || 0) + 1;
			const status =
				bounceType === "hard" || bounceCount >= 3
					? "bounced"
					: subscriber.status;

			await Subscriber.findByIdAndUpdate(subscriberId, {
				$inc: { "metrics.bounces": 1 },
				$set: {
					status,
					lastInteraction: new Date(),
					...(status === "bounced" && {
						"metadata.bounceReason": reason,
						"metadata.bounceDate": new Date(),
					}),
				},
				$push: {
					"metrics.interactions": {
						type: "bounce",
						bounceType,
						reason,
						timestamp: new Date(),
					},
				},
			});
		} catch (error) {
			logger.error(
				`Error tracking bounce for subscriber ${subscriberId}:`,
				error,
			);
			throw error;
		}
	}

	static async updateEngagementScore(subscriberId: string) {
		try {
			const subscriber = await Subscriber.findById(subscriberId);
			if (!subscriber) return;

			const score = await this.calculateEngagementScore(subscriber);

			await Subscriber.findByIdAndUpdate(subscriberId, {
				$set: {
					engagementScore: score,
					lastEngagementUpdate: new Date(),
				},
			});

			return score;
		} catch (error) {
			logger.error(
				`Error updating engagement score for subscriber ${subscriberId}:`,
				error,
			);
			throw error;
		}
	}

	private static async calculateEngagementScore(
		subscriber: any,
	): Promise<number> {
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		// Get recent interactions
		const recentInteractions = (subscriber.metrics?.interactions || []).filter(
			(i) => new Date(i.timestamp) > thirtyDaysAgo,
		);

		// Weight factors
		const weights = {
			open: 1,
			click: 2,
			conversion: 5,
			recency: 0.5,
		};

		// Calculate base score
		let score = recentInteractions.reduce((acc, interaction) => {
			switch (interaction.type) {
				case "open":
					return acc + weights.open;
				case "click":
					return acc + weights.click;
				case "conversion":
					return acc + weights.conversion;
				default:
					return acc;
			}
		}, 0);

		// Normalize to 0-100 scale
		score = Math.min(100, (score / 50) * 100);

		// Apply recency factor
		const lastInteraction = new Date(subscriber.lastInteraction);
		const daysSinceLastInteraction =
			(now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
		const recencyFactor = Math.max(0, 1 - daysSinceLastInteraction / 30);

		score *= 1 + recencyFactor * weights.recency;

		return Math.min(100, Math.max(0, score));
	}
}
