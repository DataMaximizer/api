import { OPENAI_API_KEY } from "@/local";
import {
  ConversionAnalysisAgent,
  IWritingStylePerformance,
} from "../conversion-analysis/ConversionAnalysisAgent";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import OpenAI from "openai";
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
  OfferSelectionAgent,
  Personality,
  Tone,
  WritingStyle,
} from "../offer-selection/OfferSelectionAgent";
import { BlockedEmail } from "@/features/subscriber/models/blocked-email.model";
import { IAddress, User } from "@/features/user/models/user.model";

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
   * @param styleOptions - Optional style configurations
   * @returns The generated email content.
   */
  public async generateEmailMarketing(
    offerId: string,
    styleOptions: {
      writingStyle: WritingStyle;
      copywritingStyle: CopywritingStyle;
      tone: Tone;
      personality: Personality;
    }
  ): Promise<string> {
    // Fetch the offer from the AffiliateOffer model.
    const offer = await AffiliateOffer.findById(offerId);
    if (!offer) throw new Error("Offer not found");

    // Pass along the personalization message as extra instructions
    const extraRules = `
    - Don't use placeholders like [Name] or anything similar to refer to the subscriber.
    - Be sure to sound like a human and not like a robot.
    - You MUST add the offer url link to the email, this is VERY important.
    - Wherever you put the offer url, make sure to put {offer_url} placeholder inside the <a> href attribute, this is very important.
    - DO NOT add telephone numbers to the email or any other contact information, the only thing you should add is the offer url.
    - DO NOT segmentate the email showing the framework steps, like "Before", "After", "Bridge", "Problem", "Agitation", "Solution" etc.
    - The call to action link should be put in the middle of the email, not at the end. It should be a plain text link, not a button. Also, there should be 1 to 3 links in the email, all pointing to {offer_url}, you can choose when to use them to make it more appealing.
    - Highlight some action words in bold using <b> tags, but not too many, only a few to make it more appealing.
    - Your response should be in a valid JSON format with the following keys:
      - subject: The subject of the email.
      - body: The body of the email in HTML format compliant with email clients, escape if needed.

    Closely follow this writing style:

    <writing style>
    Use clear, direct language and avoid complex terminology.
    Aim for a Flesch reading score of 80 or higher.
    Use the active voice.
    Avoid adverbs.
    Avoid buzzwords and instead use plain English.
    Use jargon where relevant.
    Avoid being salesy or overly enthusiastic and instead express calm confidence.
    </writing style>
    `;

    const emailContent = await CampaignService.generateEmailContent(
      offer.productInfo,
      styleOptions.copywritingStyle,
      styleOptions.tone,
      styleOptions.personality,
      styleOptions.writingStyle,
      extraRules,
      true
    );

    return emailContent;
  }

  public async generateCampaign(
    campaignData: Pick<
      ICampaign,
      "name" | "subject" | "content" | "framework" | "tone" | "writingStyle"
    >,
    userId: string,
    offerId: string,
    smtpProviderId: string
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
      writingStyle: campaignData.writingStyle,
      smtpProviderId: new Types.ObjectId(smtpProviderId),
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
   * Starts a campaign with random writing styles for a subset of subscribers.
   *
   * @param offerIds - Array of offer IDs to distribute
   * @param subscriberListId - ID of the subscriber list
   * @param smtpProviderId - ID of the SMTP provider
   * @returns Promise<void>
   */
  public async startRandomCampaign(
    offerIds: string[],
    subscriberListId: string,
    smtpProviderId: string,
    userId: string,
    selectionPercentage: number = 0.2
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
    }[][]
  > {
    // Get all active subscribers from the list
    const subscribers = await Subscriber.find({
      lists: { $in: [new Types.ObjectId(subscriberListId)] },
      status: "active",
    });

    if (!subscribers.length) {
      throw new Error("No active subscribers found in the list");
    }

    // Get blocked emails for this user
    const blockedEmails = await BlockedEmail.find({
      userId: new Types.ObjectId(userId),
    }).distinct("email");
    const blockedEmailSet = new Set(
      blockedEmails.map((email) => email.toLowerCase())
    );

    // Filter out subscribers with blocked emails
    const validSubscribers = subscribers.filter(
      (sub) => !blockedEmailSet.has(sub.email.toLowerCase())
    );

    if (!validSubscribers.length) {
      throw new Error(
        "No valid subscribers found after filtering blocked emails"
      );
    }

    // Get user website url
    const user = await User.findById(userId);
    const websiteUrl = user?.companyUrl;

    if (!websiteUrl) {
      throw new Error("User website url not found");
    }

    // Extract subscriber IDs from filtered list
    const subscriberIds = validSubscribers.map((sub) => sub.id);

    // Initialize OfferSelectionAgent
    const offerSelectionAgent = new OfferSelectionAgent();

    // Get distribution of subscribers to offers with their writing styles
    const distribution =
      await offerSelectionAgent.distributeOffersToSubscribers(
        subscriberIds,
        offerIds,
        selectionPercentage
      );

    let toSend = [];

    // Process each offer and its assigned subscribers
    for (const [offerId, assignments] of distribution) {
      // Get the offer details
      const offer = await AffiliateOffer.findById(offerId);
      if (!offer) {
        console.error(`Offer ${offerId} not found, skipping...`);
        continue;
      }

      // Group assignments by style combination
      const styleGroups = new Map<
        string,
        {
          style: {
            writingStyle: WritingStyle;
            copywritingStyle: CopywritingStyle;
            tone: Tone;
            personality: Personality;
          };
          subscribers: string[];
        }
      >();

      assignments.forEach((assignment) => {
        const styleKey = JSON.stringify({
          writingStyle: assignment.writingStyle,
          copywritingStyle: assignment.copywritingStyle,
          tone: assignment.tone,
          personality: assignment.personality,
        });

        if (!styleGroups.has(styleKey)) {
          styleGroups.set(styleKey, {
            style: {
              writingStyle: assignment.writingStyle,
              copywritingStyle: assignment.copywritingStyle,
              tone: assignment.tone,
              personality: assignment.personality,
            },
            subscribers: [],
          });
        }

        styleGroups.get(styleKey)!.subscribers.push(assignment.subscriberId);
      });

      // Process each style group
      const emailData = await Promise.all(
        Array.from(styleGroups.entries()).map(async ([_, group]) => {
          // Generate email content once per style combination
          const emailContent = await this.generateEmailMarketing(
            offerId,
            group.style
          );
          const parsedContent = JSON.parse(emailContent);
          const currentTimestamp = new Date().getTime();
          const campaignName = `Random Test - ${offer.name} - ${currentTimestamp}`;

          // Create one campaign per style combination
          const campaign = await this.generateCampaign(
            {
              name: campaignName,
              content: parsedContent.body,
              subject: parsedContent.subject,
              framework: group.style.copywritingStyle,
              tone: group.style.tone,
              writingStyle: group.style.writingStyle,
            },
            userId,
            offerId,
            smtpProviderId
          );

          // Return data for each subscriber in this style group
          return group.subscribers.map((subscriberId) => ({
            offerId,
            offerName: offer.name,
            offerUrl: offer.url,
            campaignId: campaign.id,
            campaignName,
            subscriberId,
            subscriberEmail: validSubscribers.find(
              (sub) => sub.id === subscriberId
            )?.email,
            subject: parsedContent.subject,
            content: parsedContent.body,
            ...group.style,
          }));
        })
      );

      toSend.push(emailData.flat());
    }

    // Send emails
    for (const data of toSend.flatMap((d) => d)) {
      await CampaignService.sendCampaignEmail(
        data.offerId,
        data.subscriberId,
        data.campaignId,
        smtpProviderId,
        data.content,
        data.subject,
        websiteUrl,
        user?.address as IAddress,
        user?.companyName as string
      );
    }

    return toSend;
  }
}
