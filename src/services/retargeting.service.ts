import { Subscriber, ISubscriber } from "../models/subscriber.model";
import { Campaign, ICampaign } from "../models/campaign.model";
import { AffiliateOffer } from "../models/affiliate-offer.model";
import { logger } from "../config/logger";
import { Types } from "mongoose";
import {
	IInteraction,
	InteractionType,
	InteractionWeight,
} from "../types/interaction";

interface InterestProfile {
	categories: Array<{
		category: string;
		weight: number;
	}>;
	lastUpdate: Date;
}

export class RetargetingService {
	private static readonly MIN_INTERACTION_THRESHOLD = 3;
	private static readonly MAX_HISTORY_DAYS = 90;
	private static readonly MIN_ENGAGEMENT_SCORE = 20;

	private static readonly INTERACTION_WEIGHTS: InteractionWeight = {
		open: 1,
		click: 2,
		conversion: 5,
	};

	static async analyzeSubscriberInterests(
		subscriberId: string,
	): Promise<InterestProfile> {
		try {
			const subscriber = await Subscriber.findById(subscriberId).populate({
				path: "metrics.interactions.offerId",
				model: "AffiliateOffer",
				select: "categories",
			});

			if (!subscriber) throw new Error("Subscriber not found");

			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - this.MAX_HISTORY_DAYS);

			const recentInteractions = (subscriber.metrics?.interactions || [])
				.filter(
					(interaction: IInteraction) => interaction.timestamp > recentDate,
				)
				.map(
					(
						interaction: IInteraction & { offerId?: { categories: string[] } },
					) => ({
						...interaction,
						offerCategories: interaction.offerId?.categories || [],
					}),
				);

			const categoryWeights = new Map<string, number>();

			recentInteractions.forEach((interaction) => {
				interaction.offerCategories.forEach((category: string) => {
					const weight = this.calculateInteractionWeight(interaction.type);
					const currentWeight = categoryWeights.get(category) || 0;
					categoryWeights.set(category, currentWeight + weight);
				});
			});

			const categories = Array.from(categoryWeights.entries())
				.map(([category, weight]) => ({
					category,
					weight: this.normalizeWeight(weight),
				}))
				.sort((a, b) => b.weight - a.weight);

			return {
				categories,
				lastUpdate: new Date(),
			};
		} catch (error) {
			logger.error("Error analyzing subscriber interests:", error);
			throw error;
		}
	}

	private static calculateInteractionWeight(type: InteractionType): number {
		const weight = this.INTERACTION_WEIGHTS[type];
		if (weight === undefined) return 0;

		const daysSinceInteraction = Math.floor(
			(Date.now() - new Date().getTime()) / (1000 * 60 * 60 * 24),
		);
		const recencyMultiplier = Math.max(
			0.1,
			1 - daysSinceInteraction / this.MAX_HISTORY_DAYS,
		);

		return weight * recencyMultiplier;
	}

	private static normalizeWeight(weight: number): number {
		return Math.min(1, Math.max(0, weight / this.MIN_INTERACTION_THRESHOLD));
	}

	static async findNewInterests(subscriberId: string): Promise<string[]> {
		try {
			const interests = await this.analyzeSubscriberInterests(subscriberId);
			const currentCategories = new Set(
				interests.categories.map((c) => c.category),
			);

			const unexploredOffers = await AffiliateOffer.find({
				status: "active",
				categories: {
					$nin: Array.from(currentCategories),
				},
			})
				.sort("-metrics.conversions")
				.limit(5);

			return Array.from(
				new Set(unexploredOffers.flatMap((offer) => offer.categories)),
			);
		} catch (error) {
			logger.error("Error finding new interests:", error);
			throw error;
		}
	}

	static async generateRetargetingCampaign(
		subscriberId: string,
		userId: string,
	): Promise<ICampaign | null> {
		try {
			const subscriber = await Subscriber.findById(subscriberId);
			if (!subscriber) throw new Error("Subscriber not found");

			if ((subscriber.engagementScore || 0) < this.MIN_ENGAGEMENT_SCORE) {
				logger.info(
					`Subscriber ${subscriberId} has low engagement score, skipping retargeting`,
				);
				return null;
			}

			const interests = await this.analyzeSubscriberInterests(subscriberId);
			const newCategories = await this.findNewInterests(subscriberId);

			const targetCategories = [
				...interests.categories.map((c) => c.category),
				...newCategories,
			].slice(0, 5);

			const offers = await AffiliateOffer.find({
				status: "active",
				categories: { $in: targetCategories },
			})
				.sort("-metrics.conversions")
				.limit(3);

			if (offers.length === 0) {
				logger.info(`No suitable offers found for subscriber ${subscriberId}`);
				return null;
			}

			const campaign = await Campaign.create({
				name: `Retargeting Campaign - ${subscriber.email}`,
				type: "email",
				userId: new Types.ObjectId(userId),
				segments: [new Types.ObjectId(subscriberId)],
				status: "draft",
				settings: {
					isRetargeting: true,
					targetOffers: offers.map((offer) => offer._id),
				},
			});

			return campaign;
		} catch (error) {
			logger.error("Error generating retargeting campaign:", error);
			throw error;
		}
	}

	static async shouldContinueTargeting(subscriberId: string): Promise<boolean> {
		try {
			const subscriber = await Subscriber.findById(subscriberId);
			if (!subscriber) return false;

			if ((subscriber.engagementScore || 0) < this.MIN_ENGAGEMENT_SCORE) {
				return false;
			}

			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 30);

			const recentInteractions =
				subscriber.metrics?.interactions?.filter(
					(interaction: IInteraction) => interaction.timestamp > recentDate,
				) || [];

			if (recentInteractions.length === 0) {
				return false;
			}

			const clicks = recentInteractions.filter(
				(i) => i.type === "click",
			).length;
			const conversions = recentInteractions.filter(
				(i) => i.type === "conversion",
			).length;
			const conversionRate = clicks > 0 ? conversions / clicks : 0;

			return conversionRate >= 0.01;
		} catch (error) {
			logger.error("Error checking targeting status:", error);
			return false;
		}
	}
}
