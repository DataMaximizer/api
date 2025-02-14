import {
  IAffiliateOffer,
  AffiliateOffer,
  OfferStatus,
} from "@features/affiliate/models/affiliate-offer.model";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { RetargetingService } from "@features/retargeting/retargeting.service";
import {
  scoreOfferForUser,
  LOW_ENGAGEMENT_THRESHOLD,
  DEFAULT_EPSILON,
  IInterestProfile,
} from "./offerSelectionUtils";
import { Campaign } from "@features/campaign/models/campaign.model";
import { Types } from "mongoose";

/**
 * Defines the result of the offer selection process.
 * Note: The property selectedOffer has been updated to selectedOffers to hold one or more offers.
 * Also, each offer includes its own adjustments.
 */
export type ISelectedOffer = IAffiliateOffer & {
  method: "randomized" | "highest-scoring";
  adjustments?: {
    writingStyleSuggestion?: string;
    offerAngleSuggestion?: string;
  };
};

export interface OfferSelectionResult {
  selectedOffers: ISelectedOffer[];
}

export type CopywritingStyle =
  | "AIDA" // Attention, Interest, Desire, Action
  | "PAS" // Problem, Agitation, Solution
  | "BAB" // Before, After, Bridge
  | "PPP" // Problem, Promise, Proof
  | "FAB" // Features, Advantages, Benefits
  | "QUEST"; // Qualify, Understand, Educate, Stimulate, Transition

export type WritingStyle =
  | "descriptive"
  | "narrative"
  | "persuasive"
  | "expository"
  | "conversational"
  | "direct";

export type Tone =
  | "professional"
  | "friendly"
  | "enthusiastic"
  | "urgent"
  | "empathetic"
  | "authoritative"
  | "casual";

export type Personality =
  | "confident"
  | "humorous"
  | "analytical"
  | "caring"
  | "adventurous"
  | "innovative"
  | "trustworthy";

export interface SubscriberAssignment {
  subscriberId: string;
  copywritingStyle: CopywritingStyle;
  writingStyle: WritingStyle;
  tone: Tone;
  personality: Personality;
}

/**
 * The OfferSelectionAgent class uses an epsilon-greedy (multi-armed bandit) approach to select offer(s).
 * It can now select more than one offer based on the provided parameter.
 */
export class OfferSelectionAgent {
  private epsilon: number;

  constructor(epsilon = DEFAULT_EPSILON) {
    this.epsilon = epsilon;
  }

  /**
   * Selects offer(s) for a subscriber.
   *
   * @param subscriberId - The ID of the subscriber.
   * @param numOffers - Number of offers to be selected (default is 1).
   * @returns A Promise resolving to an OfferSelectionResult which contains:
   *          - An array of the selected offer(s), each with its own adjustment recommendations.
   *
   * @throws An error if the subscriber is not found or no active offers exist.
   */
  public async selectOfferForSubscriber(
    subscriberId: string,
    numOffers: number = 1
  ): Promise<OfferSelectionResult> {
    // Fetch subscriber details.
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      throw new Error("Subscriber not found");
    }

    // Retrieve the subscriber's interest profile.
    const interestProfileData =
      await RetargetingService.analyzeSubscriberInterests(subscriberId);
    const interestProfile: IInterestProfile = {
      categories: interestProfileData.categories || [],
    };

    // Retrieve all active offers.
    const candidateOffers: IAffiliateOffer[] = await AffiliateOffer.find({
      status: OfferStatus.ACTIVE,
    });
    if (!candidateOffers || candidateOffers.length === 0) {
      throw new Error("No active offers found");
    }

    // Compute scores for each offer.
    const scoredOffers = await Promise.all(
      candidateOffers.map(async (offer) => {
        const score = await scoreOfferForUser(
          offer,
          interestProfile,
          subscriber
        );
        return { offer, score };
      })
    );

    // Ensure we don't attempt to pick more offers than available.
    const offersToPick = Math.min(numOffers, scoredOffers.length);
    // Create a copy of the scoredOffers array that we can modify.
    let remainingOffers = [...scoredOffers];
    const selectedOffers: ISelectedOffer[] = [];
    let randomCount = 0;
    let highestCount = 0;

    // For each offer slot, decide with a coin flip whether to select a random offer
    // or choose the highest-scoring offer from the remaining candidates.
    // Each selected offer is removed from the remainingOffers array to avoid duplicates.
    for (let i = 0; i < offersToPick; i++) {
      if (Math.random() < this.epsilon) {
        // Random selection: choose one offer at random.
        const randomIndex = Math.floor(Math.random() * remainingOffers.length);
        selectedOffers.push({
          ...remainingOffers[randomIndex].offer.toObject(),
          method: "randomized",
        });
        randomCount++;
        remainingOffers.splice(randomIndex, 1);
      } else {
        // Highest-scoring selection: iterate through remainingOffers to find the best candidate.
        let bestIndex = 0;
        let bestScore = remainingOffers[0].score;
        for (let j = 1; j < remainingOffers.length; j++) {
          if (remainingOffers[j].score > bestScore) {
            bestScore = remainingOffers[j].score;
            bestIndex = j;
          }
        }
        selectedOffers.push({
          ...remainingOffers[bestIndex].offer.toObject(),
          method: "highest-scoring",
        });
        highestCount++;
        remainingOffers.splice(bestIndex, 1);
      }
    }

    // Compute adjustments for each selected offer based on subscriber interactions.
    // First, get the subscriber interactions that reference a campaign.
    const interactions = subscriber.metrics.interactions || [];
    // Get unique campaign IDs from the interactions.
    const campaignIds = interactions
      .filter(
        (inter) =>
          inter.campaignId &&
          inter.type !== "conversion" &&
          inter.type !== "bounce"
      )
      .map((inter) => inter.campaignId!.toString());
    const uniqueCampaignIds = Array.from(new Set(campaignIds));

    // Load all campaigns that the subscriber interacted with.
    const campaigns = await Campaign.find({ _id: { $in: uniqueCampaignIds } });
    // Create a lookup map for campaigns by their id.
    const campaignById = new Map<string, (typeof campaigns)[0]>();
    campaigns.forEach((campaign) => {
      campaignById.set(campaign.id, campaign);
    });

    // For each selected offer, filter interactions that belong to campaigns using that offer.
    for (const offer of selectedOffers) {
      // Find interactions that have a campaignId and where the campaign's offerId matches the current offer.
      const relatedInteractions = interactions.filter((inter) => {
        if (!inter.campaignId) return false;
        const campaign = campaignById.get(inter.campaignId.toString());
        if (!campaign) return false;
        // Compare the campaign's offerId to the current offer's _id.
        return (
          campaign.offerId.toString() ===
          (offer._id as Types.ObjectId).toString()
        );
      });

      // Initialize an adjustments object.
      const adjustments: {
        writingStyleSuggestion?: string;
        offerAngleSuggestion?: string;
      } = {};

      // Example logic: if there are clicks but no conversions for this offer, suggest a change in writing style.
      const clicksCount = relatedInteractions.filter(
        (inter) => inter.type === "click"
      ).length;
      const conversionsCount = relatedInteractions.filter(
        (inter) => inter.type === "conversion"
      ).length;
      if (clicksCount > 0 && conversionsCount === 0) {
        adjustments.writingStyleSuggestion =
          "Emphasize urgency or social proof (e.g., testimonials) in the email.";
      }
      // Also, if the subscriber's overall engagement is low, suggest a different offer angle.
      if (subscriber.engagementScore < LOW_ENGAGEMENT_THRESHOLD) {
        adjustments.offerAngleSuggestion =
          "Experiment with alternative offer angles, such as adding bonuses or limited-time offers.";
      }

      // Attach adjustments if any were computed.
      if (
        adjustments.writingStyleSuggestion ||
        adjustments.offerAngleSuggestion
      ) {
        offer.adjustments = adjustments;
      }
    }

    return {
      selectedOffers,
    };
  }

  /**
   * Distributes offers among a random subset of subscribers.
   *
   * @param subscriberIds - Array of subscriber IDs to choose from
   * @param offerIds - Array of offer IDs to distribute
   * @returns A Map where keys are offer IDs and values are arrays of subscriber assignments
   */
  public async distributeOffersToSubscribers(
    subscriberIds: string[],
    offerIds: string[],
    selectionPercentage: number = 0.2
  ): Promise<Map<string, SubscriberAssignment[]>> {
    if (!subscriberIds.length || !offerIds.length) {
      throw new Error("Both subscriberIds and offerIds must not be empty");
    }

    const copywritingStyles: CopywritingStyle[] = [
      "AIDA",
      "PAS",
      "BAB",
      "PPP",
      "FAB",
      "QUEST",
    ];

    const writingStyles: WritingStyle[] = [
      "descriptive",
      "narrative",
      "persuasive",
      "expository",
      "conversational",
      "direct",
    ];

    const tones: Tone[] = [
      "professional",
      "friendly",
      "enthusiastic",
      "urgent",
      "empathetic",
      "authoritative",
      "casual",
    ];

    const personalities: Personality[] = [
      "confident",
      "humorous",
      "analytical",
      "caring",
      "adventurous",
      "innovative",
      "trustworthy",
    ];

    // Calculate 20% of total subscribers (rounded up)
    const totalToSelect = Math.ceil(subscriberIds.length * selectionPercentage);

    // Randomly select 20% of subscribers
    const shuffledSubscribers = [...subscriberIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, totalToSelect);

    // Create a pool of available subscribers
    let availableSubscribers = [...shuffledSubscribers];

    // Generate random weights for each offer
    const offerWeights = offerIds.map(() => Math.random());
    const totalWeight = offerWeights.reduce((sum, weight) => sum + weight, 0);

    // Normalize weights to sum up to the total available subscribers
    const normalizedWeights = offerWeights.map((weight) =>
      Math.ceil((weight / totalWeight) * availableSubscribers.length)
    );

    // Create the distribution map
    const distribution = new Map<string, SubscriberAssignment[]>();

    // Helper function to get random element from array
    const getRandomElement = <T>(array: T[]): T =>
      array[Math.floor(Math.random() * array.length)];

    // Distribute subscribers to offers
    for (let i = 0; i < offerIds.length; i++) {
      const offerId = offerIds[i];
      const subscribersToSelect = Math.min(
        normalizedWeights[i],
        availableSubscribers.length
      );

      // Randomly select subscribers for this offer and assign styles
      const selectedSubscribers = availableSubscribers
        .sort(() => Math.random() - 0.5)
        .slice(0, subscribersToSelect)
        .map((subscriberId) => ({
          subscriberId,
          copywritingStyle: getRandomElement(copywritingStyles),
          writingStyle: getRandomElement(writingStyles),
          tone: getRandomElement(tones),
          personality: getRandomElement(personalities),
        }));

      // Remove selected subscribers from available pool
      availableSubscribers = availableSubscribers.filter(
        (id) =>
          !selectedSubscribers.some(
            (assignment) => assignment.subscriberId === id
          )
      );

      // Add to distribution map
      distribution.set(offerId, selectedSubscribers);
    }

    return distribution;
  }
}
