import { Types } from "mongoose";
import { Campaign } from "@features/campaign/models/campaign.model";
import { IAffiliateOffer } from "@features/affiliate/models/affiliate-offer.model";
import { ISubscriber } from "@features/subscriber/models/subscriber.model";

/**
 * Configurable constants for the offer selection logic.
 */
export const DEFAULT_EPSILON = 0.2; // Exploration rate.
export const LOW_ENGAGEMENT_THRESHOLD = 50; // Subscribers below this engagement are considered low engaged.
export const LOW_ENGAGEMENT_MULTIPLIER = 0.9; // Apply this multiplier for low-engagement subscribers.
export const SUBSCRIBER_MATCH_THRESHOLD = 30; // Minimum engagement to consider a subscriber a match.
export const HIGH_ENGAGEMENT_SUBSCRIBER_THRESHOLD = 50; // Fallback engagement threshold.
export const RANDOM_NOISE_FACTOR = 0.05; // Maximum random noise to add to the score.

/**
 * An interface representing the interest profile for a subscriber.
 */
export interface IInterestProfile {
  categories: {
    category: string;
    weight: number;
  }[];
}

/**
 * Queries all campaigns referencing a given offer to aggregate performance metrics.
 *
 * @param offerId - The ObjectId of the offer.
 * @returns An object with total conversions and clicks.
 */
export async function getOfferCampaignMetrics(
  offerId: Types.ObjectId
): Promise<{ conversions: number; clicks: number }> {
  const campaigns = await Campaign.find({ offerId });
  let totalConversions = 0;
  let totalClicks = 0;

  campaigns.forEach((campaign) => {
    const metrics = campaign.metrics;
    if (!metrics) return;
    totalConversions += metrics.totalConversions || 0;
    totalClicks += metrics.totalClicks || 0;
  });

  return { conversions: totalConversions, clicks: totalClicks };
}

/**
 * Calculates a score for a given offer for a subscriber.
 *
 * Score components:
 * - Conversion rate from aggregated campaign metrics.
 * - A boost if the offer categories match the subscriber's interest profile.
 * - A penalty for low engagement.
 * - A random noise factor for controlled exploration.
 *
 * @param offer - The candidate affiliate offer.
 * @param interestProfile - The subscriber's interest profile.
 * @param subscriber - The subscriber information.
 * @returns The computed score as a Promise<number>.
 */
export async function scoreOfferForUser(
  offer: IAffiliateOffer,
  interestProfile: IInterestProfile,
  subscriber: ISubscriber
): Promise<number> {
  const { conversions, clicks } = await getOfferCampaignMetrics(
    offer._id as Types.ObjectId
  );
  const conversionRate: number = conversions / (clicks + 1);
  let baseScore = conversionRate;

  // Boost score where offer categories match the subscriber's interest profile.
  let categoryBoost = 0;
  if (
    offer.categories &&
    Array.isArray(offer.categories) &&
    interestProfile.categories
  ) {
    for (const category of offer.categories) {
      const match = interestProfile.categories.find(
        (c) => c.category.toLowerCase() === category.toLowerCase()
      );
      if (match) {
        categoryBoost += match.weight;
      }
    }
  }
  baseScore += categoryBoost;

  // Apply a penalty for low-engagement subscribers.
  if (subscriber.engagementScore < LOW_ENGAGEMENT_THRESHOLD) {
    baseScore *= LOW_ENGAGEMENT_MULTIPLIER;
  }

  // Add a bit of random noise to enable controlled exploratory selections.
  baseScore += Math.random() * RANDOM_NOISE_FACTOR;

  return baseScore;
}
