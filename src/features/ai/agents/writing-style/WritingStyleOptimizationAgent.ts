import {
  ConversionAnalysisAgent,
  IWritingStylePerformance,
} from "../conversion-analysis/ConversionAnalysisAgent";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { AffiliateOffer } from "@/features/affiliate/models/affiliate-offer.model";
import { CampaignService } from "@/features/campaign/campaign.service";
import {
  Campaign,
  CampaignType,
  CampaignStatus,
  ICampaign,
} from "@/features/campaign/models/campaign.model";
import { Types } from "mongoose";
import {
  CopywritingStyle,
  Personality,
  Tone,
  WritingStyle,
} from "../offer-selection/OfferSelectionAgent";
import { IAddress, User } from "@/features/user/models/user.model";
import { UserService } from "@/features/user/user.service";
import { logger } from "@/config/logger";
import { FallbackAiProvider } from "../../providers/fallback.provider";

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
          await WritingStyleOptimizationAgent.getBestFittingWritingStyle(productDescription);
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
    productDescription: string,
  ): Promise<string> {
    // Build a prompt instructing GPT to choose one of the styles.
    const prompt = `
      Given the following product description:
      ${productDescription}
      
      Which writing style from the following list best fits the product for a marketing email?
      Please choose only one exact writing style from the options below and respond with only the style name.
      Options: ${availableRecommendedStyles.join(", ")}
    `;

    const aiclient = new FallbackAiProvider({});
    const selectedStyle = await aiclient.generateCompletion(prompt);

    // Validate that the returned style is one of the available options.
    const matchingStyle = availableRecommendedStyles.find(
      (style) => style.toLowerCase() === selectedStyle.toLowerCase()
    );
    return matchingStyle || "Short & Direct";
  }

  public async generateCampaign(
    campaignData: Pick<
      ICampaign,
      | "name"
      | "subject"
      | "content"
      | "framework"
      | "tone"
      | "writingStyle"
      | "personality"
    > & {
      generatedPrompt?: string;
      aiProvider?: string;
      aiModel?: string;
    },
    userId: string,
    offerId: string,
    smtpProviderId: string,
    campaignProcessId: string
  ) {
    const campaign = await Campaign.create({
      name: campaignData.name,
      type: CampaignType.EMAIL,
      status: CampaignStatus.RUNNING,
      userId: new Types.ObjectId(userId),
      offerId: new Types.ObjectId(offerId),
      subject: campaignData.subject,
      content: campaignData.content,
      framework: campaignData.framework,
      tone: campaignData.tone,
      personality: campaignData.personality,
      writingStyle: campaignData.writingStyle,
      smtpProviderId: new Types.ObjectId(smtpProviderId),
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      metrics: {
        totalSent: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
      },
    });

    return campaign;
  }

  /**
   * Creates campaigns for specific subscribers in a segment
   * Randomly distributes the offers among subscribers so each subscriber gets one offer
   *
   * @param offerIds - Array of offer IDs to create campaigns for
   * @param subscriberIds - Array of subscriber IDs in the segment
   * @param smtpProviderId - SMTP provider ID
   * @param userId - User ID
   * @param senderName - Sender name
   * @param senderEmail - Sender email
   * @param aiProvider - AI provider (openai or claude)
   * @param styleOptions - Writing style options
   * @param audience - Target audience description
   * @returns Array of campaign results
   */
  public async startCampaignForSegment(
    offerIds: string[],
    subscriberIds: string[],
    smtpProviderId: string,
    userId: string,
    senderName: string,
    senderEmail: string,
    aiProvider: "openai" | "claude",
    styleOptions: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    },
    audience: string = "General audience",
    campaignProcessId: string
  ): Promise<
    {
      offerId: string;
      offerName: string;
      offerUrl: string;
      campaignId: string;
      campaignName: string;
      subscriberId: string;
      subject: string;
      content: string;
      senderName: string;
      senderEmail: string;
      aiProvider: "openai" | "claude";
      generatedPrompt?: string;
      aiModel?: string;
    }[][]
  > {
    if (!subscriberIds.length) {
      throw new Error("No subscribers provided for campaign");
    }

    if (!offerIds.length) {
      throw new Error("No offers provided for campaign");
    }

    // Get subscribers by IDs
    const subscribers = await Subscriber.find({
      _id: { $in: subscriberIds.map((id) => new Types.ObjectId(id)) },
      status: "active",
    });

    if (!subscribers.length) {
      throw new Error("No active subscribers found in the segment");
    }

    logger.info(
      `Creating campaigns for ${subscribers.length} subscribers with style:`,
      styleOptions
    );

    // Get user website url
    const user = await User.findById(userId);
    const websiteUrl = user?.companyUrl;

    if (websiteUrl === undefined) {
      throw new Error("User website url not found");
    }

    // Get API keys
    const { openAiKey, claudeKey } = await UserService.getUserApiKeys(userId);

    // Get the offers
    const offers = await Promise.all(
      offerIds.map(async (offerId) => {
        const offer = await AffiliateOffer.findById(offerId);
        if (!offer) {
          throw new Error(`Offer with ID ${offerId} not found`);
        }
        return offer;
      })
    );

    // Randomly distribute offers among subscribers - assign each subscriber one offer
    const subscriberToOfferMap = new Map<string, (typeof offers)[0]>();

    // Shuffle subscribers to ensure random distribution
    const shuffledSubscribers = [...subscribers].sort(
      () => Math.random() - 0.5
    );

    // Assign offers to subscribers in a round-robin fashion
    shuffledSubscribers.forEach((subscriber, index) => {
      const offerIndex = index % offers.length;
      subscriberToOfferMap.set(subscriber.id, offers[offerIndex]);
    });

    logger.info(
      `Mapped ${subscriberToOfferMap.size} subscribers to ${offers.length} offers`
    );

    // Group subscribers by offer for efficient campaign creation
    const offerToSubscribersMap = new Map<string, typeof subscribers>();

    for (const [subscriberId, offer] of subscriberToOfferMap.entries()) {
      if (!offerToSubscribersMap.has(offer.id)) {
        offerToSubscribersMap.set(offer.id, []);
      }

      const subscriber = subscribers.find((s: { id: string; }) => s.id === subscriberId);
      if (subscriber) {
        offerToSubscribersMap.get(offer.id)!.push(subscriber);
      }
    }

    // Results array for each offer
    const results: {
      offerId: string;
      offerName: string;
      offerUrl: string;
      campaignId: string;
      campaignName: string;
      subscriberId: string;
      subject: string;
      content: string;
      senderName: string;
      senderEmail: string;
      aiProvider: "openai" | "claude";
      generatedPrompt?: string;
      aiModel?: string;
    }[][] = [];

    // Process offers in batches to avoid rate limiting
    const BATCH_SIZE = aiProvider === "claude" ? 3 : 5; // Smaller batch size for Claude
    const offerEntries = Array.from(offerToSubscribersMap.entries());

    for (let i = 0; i < offerEntries.length; i += BATCH_SIZE) {
      const offerBatch = offerEntries.slice(i, i + BATCH_SIZE);

      // Add a small delay between batches to avoid rate limiting
      if (i > 0) {
        await new Promise((resolve) => global.setTimeout(resolve, 10000));
      }

      const batchResults = await Promise.all(
        offerBatch.map(async ([offerId, offerSubscribers]) => {
          const offer = offers.find((o: { id: string; }) => o.id === offerId);
          if (!offer) {
            throw new Error(
              `Offer with ID ${offerId} not found in available offers`
            );
          }

          // Skip if no subscribers for this offer
          if (offerSubscribers.length === 0) {
            return [];
          }

          // Generate email content using the provided style options
          const emailResult = await CampaignService.generateEmailContent(
            offer,
            styleOptions.copywritingStyle,
            styleOptions.tone,
            styleOptions.personality,
            styleOptions.writingStyle,
            audience,
            "{subscriberName}",
            true,
            aiProvider,
            openAiKey,
            claudeKey
          );

          try {
            // Parse the JSON content
            const parsedContent = JSON.parse(emailResult.content);
            const currentTimestamp = new Date().getTime();
            const campaignName = `${styleOptions.copywritingStyle} - ${offer.name} - ${currentTimestamp}`;

            // Create campaign
            const campaign = await this.generateCampaign(
              {
                name: campaignName,
                content: parsedContent.body,
                subject: parsedContent.subject,
                framework: styleOptions.copywritingStyle,
                tone: styleOptions.tone,
                writingStyle: styleOptions.writingStyle,
                personality: styleOptions.personality,
                generatedPrompt: emailResult.generatedPrompt,
                aiProvider: emailResult.aiProvider,
                aiModel: emailResult.aiModel,
              },
              userId,
              offerId,
              smtpProviderId,
              campaignProcessId
            );

            // Return data for each subscriber assigned to this offer
            return offerSubscribers.map((subscriber: { id: any; email: any; }) => ({
              offerId,
              offerName: offer.name,
              offerUrl: offer.url,
              campaignId: campaign.id,
              campaignName,
              subscriberId: subscriber.id,
              subscriberEmail: subscriber.email,
              subject: parsedContent.subject,
              content: parsedContent.body,
              senderName,
              senderEmail,
              aiProvider,
              generatedPrompt: emailResult.generatedPrompt,
              aiModel: emailResult.aiModel,
              ...styleOptions,
            }));
          } catch (error: any) {
            logger.error(
              `Error parsing email content for offer ${offerId} with ${aiProvider}:`,
              error
            );

            // Try with fallback AI provider
            try {
              logger.info(
                `Attempting fallback with ${
                  aiProvider === "openai" ? "claude" : "openai"
                } for offer ${offerId}`
              );

              const fallbackProvider =
                aiProvider === "openai"
                  ? ("claude" as const)
                  : ("openai" as const);
              const fallbackEmailResult =
                await CampaignService.generateEmailContent(
                  offer,
                  styleOptions.copywritingStyle,
                  styleOptions.tone,
                  styleOptions.personality,
                  styleOptions.writingStyle,
                  audience,
                  "{subscriberName}",
                  true,
                  fallbackProvider,
                  openAiKey,
                  claudeKey
                );

              // Parse the fallback content
              const parsedContent = JSON.parse(fallbackEmailResult.content);
              const currentTimestamp = new Date().getTime();
              const campaignName = `${styleOptions.copywritingStyle} - ${offer.name} - ${currentTimestamp} (Fallback)`;

              // Create campaign with fallback content
              const campaign = await this.generateCampaign(
                {
                  name: campaignName,
                  content: parsedContent.body,
                  subject: parsedContent.subject,
                  framework: styleOptions.copywritingStyle,
                  tone: styleOptions.tone,
                  writingStyle: styleOptions.writingStyle,
                  personality: styleOptions.personality,
                  generatedPrompt: fallbackEmailResult.generatedPrompt,
                  aiProvider: fallbackEmailResult.aiProvider,
                  aiModel: fallbackEmailResult.aiModel,
                },
                userId,
                offerId,
                smtpProviderId,
                campaignProcessId
              );

              // Return data using the fallback provider's content
              return offerSubscribers.map((subscriber: { id: any; email: any; }) => ({
                offerId,
                offerName: offer.name,
                offerUrl: offer.url,
                campaignId: campaign.id,
                campaignName,
                subscriberId: subscriber.id,
                subscriberEmail: subscriber.email,
                subject: parsedContent.subject,
                content: parsedContent.body,
                senderName,
                senderEmail,
                aiProvider: fallbackProvider,
                generatedPrompt: fallbackEmailResult.generatedPrompt,
                aiModel: fallbackEmailResult.aiModel,
                ...styleOptions,
              }));
            } catch (fallbackError: any) {
              logger.error(
                `Fallback AI provider also failed for offer ${offerId}. Original error: ${error.message}, Fallback error: ${fallbackError.message}`
              );
              throw new Error(
                `Both AI providers failed to generate content for offer ${offerId}. Please check your API keys and try again.`
              );
            }
          }
        })
      );

      results.push(...batchResults.filter((result: string | any[]) => result.length > 0));
    }

    // Send emails in batches to avoid overwhelming the system
    const SEND_BATCH_SIZE = 10;
    const allEmails = results.flatMap((r) => r);

    logger.info(`Sending ${allEmails.length} emails to subscribers`);

    for (let i = 0; i < allEmails.length; i += SEND_BATCH_SIZE) {
      const batch = allEmails.slice(i, i + SEND_BATCH_SIZE);

      await Promise.all(
        batch.map((data) =>
          CampaignService.sendCampaignEmail(
            data.offerId,
            data.subscriberId,
            data.campaignId,
            smtpProviderId,
            data.content,
            data.subject,
            websiteUrl,
            user?.address as IAddress,
            user?.companyName as string,
            data.senderName,
            data.senderEmail
          )
        )
      );

      // Add a small delay between sending batches
      if (i + SEND_BATCH_SIZE < allEmails.length) {
        await new Promise((resolve) => global.setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  public static async testCompletion() {
    const prompt = `
      Given the following product description:
      This is a test for a description of a product.
      
      Which writing style from the following list best fits the product for a marketing email?
      Please choose only one exact writing style from the options below and respond with only the style name.
      Options: ${availableRecommendedStyles.join(", ")}
    `;
    const aiclient = new FallbackAiProvider({});
    const completion = await aiclient.generateCompletion(prompt);

    return {
      success: (completion === "Assistant failed to generate completion")?false:true,
      response: completion,
    };
  }
  
}
