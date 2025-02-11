import { OPENAI_API_KEY } from "@/local";
import {
  ConversionAnalysisAgent,
  IWritingStylePerformance,
} from "../conversion-analysis/ConversionAnalysisAgent";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import OpenAI from "openai";
import { AffiliateOffer } from "@/features/affiliate/models/affiliate-offer.model";
import { CampaignService } from "@/features/campaign/campaign.service";

export const availableRecommendedStyles = [
  "Formal & Professional",
  "Casual & Conversational",
  "Storytelling / Narrative",
  "Persuasive & Urgent",
  "Short & Direct",
  "Spiritual / Mystical",
];

/**
 * Represents the result returned from getOptimizedWritingStyles.
 */
export interface IOptimizedWritingStyleResult {
  bestPerformingStyles: IWritingStylePerformance[];
  underperformingStyles: IWritingStylePerformance[];
  recommendedStyle: string | null;
  personalizationMessage: string;
}

export class WritingStyleOptimizationAgent {
  private conversionAgent: ConversionAnalysisAgent;
  private static openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  constructor() {
    this.conversionAgent = new ConversionAnalysisAgent();
  }

  /**
   * Analyzes writing style performance, provides personalized recommendations for the next campaign,
   * and determines the best writing style that suits the provided product description.
   *
   * The personalization message is structured as an LLM prompt snippet detailing the recommendation and supporting data.
   *
   * If performance data is available, a weighted randomness picks a recommended style.
   * Otherwise, a random style is picked, or a default is used.
   *
   * @param subscriberId - The subscriber's identifier.
   * @returns An object with personalized writing style recommendations and the list of available recommended styles.
   */
  public async getOptimizedWritingStyles(
    subscriberId: string,
    productDescription: string
  ): Promise<IOptimizedWritingStyleResult> {
    // Retrieve aggregated writing style performance insights via ConversionAnalysisAgent.
    const performance = await this.conversionAgent.getWritingStylePerformance(
      subscriberId
    );

    // Define the conversion threshold.
    const threshold = 0.1;

    // Derive best- and under-performing styles using the threshold conversion rate.
    const bestPerformingStyles = performance.filter(
      (p) => p.conversionRate >= threshold
    );
    const underperformingStyles = performance.filter(
      (p) => p.conversionRate < threshold
    );

    // Fetch subscriber for personalization.
    const subscriber = await Subscriber.findById(subscriberId);
    let recommendedStyle: string | null = null;
    let personalizationMessage = "";

    if (performance.length > 0) {
      if (performance[0].conversionRate >= threshold) {
        // Case 1: First record conversionRate is above (or equal to) threshold.
        // Weighted randomness: assign weights that decrease as the index increases.
        const weights = performance.map((_, index) => 1 / (index + 1));
        const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
        const rand = Math.random() * totalWeight;
        let cumulative = 0;
        let chosenIndex = 0;
        for (let i = 0; i < weights.length; i++) {
          cumulative += weights[i];
          if (rand < cumulative) {
            chosenIndex = i;
            break;
          }
        }
        recommendedStyle = performance[chosenIndex].writingStyle;
        personalizationMessage = `INSTRUCTIONS:
- Compose an email using a "${recommendedStyle}" writing style.
- Aggregated campaign data includes multiple writing styles with varying conversion rates. This style has a conversion rate of ${(
          performance[chosenIndex].conversionRate * 100
        ).toFixed(1)}%.
`;
        if (subscriber) {
          if (subscriber.engagementScore > 50) {
            personalizationMessage += `- The subscriber's high engagement score (${subscriber.engagementScore}) suggests they respond well to engaging, narrative content. Emphasize creative and vivid storytelling where applicable.
`;
          } else {
            personalizationMessage += `- The subscriber's engagement score (${subscriber.engagementScore}) is on the lower side; please ensure the email remains concise and action-oriented while leveraging the strengths of the "${recommendedStyle}" style.
`;
          }
        }
        personalizationMessage += `Please use the above data to craft an email aligned with these performance insights.`;
      } else {
        // Case 2: performance exists but the first record conversion rate is lower than threshold.
        // Use GPT's recommendation for the best style.
        recommendedStyle =
          await WritingStyleOptimizationAgent.getBestFittingWritingStyle(
            productDescription
          );
        personalizationMessage = `INSTRUCTIONS:
- Compose an email using a "${recommendedStyle}" writing style.
`;
        if (subscriber) {
          if (subscriber.engagementScore > 50) {
            personalizationMessage += `- The subscriber's high engagement score (${subscriber.engagementScore}) suggests they respond well to engaging, narrative content. Emphasize creative and vivid storytelling where applicable.
`;
          } else {
            personalizationMessage += `- The subscriber's engagement score (${subscriber.engagementScore}) is on the lower side; please ensure the email remains concise and action-oriented while leveraging the strengths of the "${recommendedStyle}" style.
`;
          }
        }
        personalizationMessage += `Please use the above data to craft an email aligned with these performance insights.`;
      }
    } else {
      // Fallback when no performance data is available:
      const randomIndex = Math.floor(
        Math.random() * availableRecommendedStyles.length
      );
      recommendedStyle = availableRecommendedStyles[randomIndex];
      personalizationMessage = `INSTRUCTIONS:
- Compose a marketing email using a "${recommendedStyle}" writing style.`;
    }

    return {
      bestPerformingStyles,
      underperformingStyles,
      recommendedStyle,
      personalizationMessage,
    };
  }

  /**
   * Returns the best fitting writing style for a given product description.
   * It uses the GPT API to query which writing style (from a fixed list) best fits the product.
   *
   * @param productDescription - The description of the product.
   * @returns A promise that resolves to the chosen writing style.
   */
  static async getBestFittingWritingStyle(
    productDescription: string
  ): Promise<string> {
    // Build a prompt instructing GPT to choose one of the styles.
    const prompt = `
      Given the following product description:
      ${productDescription}
      
      Which writing style from the following list best fits the product for a marketing email?
      Please choose only one exact writing style from the options below and respond with only the style name.
      Options: ${availableRecommendedStyles.join(", ")}
    `;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert marketing copywriter specialized in email campaigns.",
        },
        { role: "user", content: prompt },
      ],
    });

    // Retrieve the GPT response.
    const response = completion.choices[0].message?.content || "";
    const selectedStyle = response.trim();

    // Validate that the returned style is one of the available options.
    const matchingStyle = availableRecommendedStyles.find(
      (style) => style.toLowerCase() === selectedStyle.toLowerCase()
    );
    return matchingStyle || "Short & Direct";
  }

  /**
   * Uses GPT to write a marketing email.
   * @param offerId - The ID of the affiliate offer.
   * @param subscriberId - The subscriber's ID.
   * @returns The generated email content.
   */
  public async generateEmailMarketing(
    offerId: string,
    subscriberId: string
  ): Promise<string> {
    // Fetch the offer from the AffiliateOffer model.
    const offer = await AffiliateOffer.findById(offerId);
    if (!offer) throw new Error("Offer not found");

    // Use the offer's productInfo description in the GPT optimization.
    const optimizationResult = await this.getOptimizedWritingStyles(
      subscriberId,
      offer.productInfo ? JSON.stringify(offer.productInfo) : ""
    );

    const recommendedStyle =
      optimizationResult.recommendedStyle || "Short & Direct";
    // Set defaults for framework, tone, and personality.
    const framework = "PAS (Problem-Agitate-Solution)";
    const tone = "Friendly";
    const personality = "Expert";

    // Pass along the personalization message as extra instructions.
    const extraInstructions = optimizationResult.personalizationMessage;

    // Call the updated CampaignService.generateEmailContent.
    const emailContent = await CampaignService.generateEmailContent(
      offer.productInfo,
      framework,
      tone,
      personality,
      recommendedStyle,
      extraInstructions
    );

    return emailContent;
  }
}
