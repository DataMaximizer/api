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

/**
 * Defines the result of the offer selection process.
 * Note: The property `selectedOffer` has been updated to `selectedOffers` to hold one or more offers.
 */
type ISelectedOffer = IAffiliateOffer & {
  method: "randomized" | "highest-scoring";
};

export interface OfferSelectionResult {
  selectedOffers: ISelectedOffer[];
  adjustments: {
    writingStyleSuggestion?: string;
    offerAngleSuggestion?: string;
  };
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
   *          - An array of the selected offer(s).
   *          - Recommendations for any adjustments.
   *          - A method indicator ("randomized" or "highest-scoring") based on the majority decision.
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

    // Generate recommendations based on subscriber behavior.
    const adjustments: {
      writingStyleSuggestion?: string;
      offerAngleSuggestion?: string;
    } = {};
    if (subscriber.metrics.clicks > 0 && subscriber.metrics.conversions === 0) {
      adjustments.writingStyleSuggestion =
        "Emphasize urgency or social proof (e.g., testimonials) in the email.";
    }
    if (subscriber.engagementScore < LOW_ENGAGEMENT_THRESHOLD) {
      adjustments.offerAngleSuggestion =
        "Experiment with alternative offer angles, such as adding bonuses or limited-time offers.";
    }

    return {
      selectedOffers,
      adjustments,
    };
  }
}
