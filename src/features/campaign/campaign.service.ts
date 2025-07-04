import {
  Campaign,
  ICampaign,
  ICampaignVariant,
  CampaignStatus,
} from "./models/campaign.model";
import { logger } from "@config/logger";
import { EmailTemplateService } from "@features/email/templates/email-template.service";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { Click } from "../tracking/models/click.model";
import { AffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { Subscriber } from "../subscriber/models/subscriber.model";
import { IAddress } from "../user/models/user.model";
import { CampaignProcess } from "../ai/models/campaign-process.model";
import { PromptService } from "../prompt/prompt.service";
import { FallbackAiProvider } from "../ai/providers/fallback.provider";
import { OpenAIAssistantProvider } from "../ai/providers/openai-assistant.provider";

const EMAIL_MARKETING_ASSISTANT_ID = "asst_exoUF9TEauHAba0BbDYeAUPG";

const COPYWRITING_FRAMEWORKS = [
  "PAS (Problem-Agitate-Solution)",
  "AIDA (Attention-Interest-Desire-Action)",
  "BAB (Before-After-Bridge)",
  "4 Ps (Problem-Promise-Proof-Proposal)",
];

const WRITING_TONES = [
  "Professional",
  "Friendly",
  "Urgent",
  "Casual",
  "Humorous",
  "Formal",
  "Empathetic",
  "Authoritative",
];

const PERSONALITIES = [
  "Expert",
  "Friend",
  "Mentor",
  "Enthusiast",
  "Advisor",
  "Storyteller",
  "Authority",
  "Coach",
];

const WRITING_STYLES = [
  "Conversational",
  "Direct",
  "Narrative",
  "Educational",
  "Persuasive",
  "Analytical",
  "Emotional",
  "Minimalist",
];

export class CampaignService {
  private static readonly BATCH_SIZE = 100;

  static async createCampaign(
    campaignData: Partial<ICampaign>
  ): Promise<ICampaign> {
    try {
      if (!campaignData.writingStyle) {
        campaignData.writingStyle = "Neutral";
      }

      if (campaignData.status === CampaignStatus.SCHEDULED) {
        if (
          !campaignData.schedule?.startDate ||
          !campaignData.schedule?.sendTime
        ) {
          throw new Error(
            "Scheduled campaigns must have a start date and send time"
          );
        }

        const startDate = new Date(campaignData.schedule.startDate);
        if (startDate < new Date()) {
          throw new Error("Start date cannot be in the past");
        }

        if (campaignData.schedule.endDate) {
          const endDate = new Date(campaignData.schedule.endDate);
          if (endDate < startDate) {
            throw new Error("End date must be after start date");
          }
        }

        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(campaignData.schedule.sendTime)) {
          throw new Error("Invalid time format. Use HH:mm format");
        }

        if (campaignData.schedule.timezone !== "America/New_York") {
          throw new Error("Only America/New_York timezone is supported");
        }
      }

      const campaign = new Campaign(campaignData);
      return await campaign.save();
    } catch (error) {
      logger.error("Error creating campaign:", error);
      throw error;
    }
  }

  // static async generateEmailVariants(
  //   campaignId: string,
  //   productInfo: any,
  //   numberOfVariants: number = 2,
  //   openaiApiKey: string,
  //   anthropicApiKey: string
  // ): Promise<ICampaignVariant[]> {
  //   try {
  //     const variants: ICampaignVariant[] = [];

  //     for (let i = 0; i < numberOfVariants; i++) {
  //       const framework =
  //         COPYWRITING_FRAMEWORKS[
  //           Math.floor(Math.random() * COPYWRITING_FRAMEWORKS.length)
  //         ];
  //       const tone =
  //         WRITING_TONES[Math.floor(Math.random() * WRITING_TONES.length)];
  //       const personality =
  //         PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
  //       const writingStyle =
  //         WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];

  //       const content = await this.generateEmailContent(
  //         productInfo,
  //         framework,
  //         tone,
  //         personality,
  //         writingStyle,
  //         undefined,
  //         false,
  //         "openai",
  //         openaiApiKey,
  //         anthropicApiKey
  //       );
  //       const subject = await this.generateEmailSubject(
  //         content,
  //         "openai",
  //         openaiApiKey,
  //         anthropicApiKey
  //       );

  //       variants.push({
  //         subject,
  //         content,
  //         tone,
  //         personality,
  //         writingStyle,
  //         metrics: {
  //           opens: 0,
  //           clicks: 0,
  //           conversions: 0,
  //           revenue: 0,
  //         },
  //       } as ICampaignVariant);
  //     }

  //     await Campaign.findByIdAndUpdate(campaignId, {
  //       $push: { variants: { $each: variants } },
  //     });

  //     return variants;
  //   } catch (error) {
  //     logger.error("Error generating email variants:", error);
  //     throw error;
  //   }
  // }

  public static async generateEmailPrompt(
    productInfo: any,
    framework: string,
    tone: string,
    personality: string,
    writingStyle: string,
    targetAudience: string,
    subscriberName: string
  ): Promise<string> {
    const prompt = await PromptService.getFirstPrompt();
    if (!prompt) {
      throw new Error("No prompt found");
    }

    const promptText = prompt.text;
    const promptVariables = {
      productInfo: JSON.stringify(productInfo),
      framework,
      tone,
      personality,
      writingStyle,
      targetAudience,
      subscriberName,
    };

    return promptText.replace(
      /\{\{([^}]+)\}\}/g,
      (match, p1) =>
        promptVariables[p1 as keyof typeof promptVariables] || match
    );
  }

  public static async generateEmailContent(
    productInfo: any,
    framework: string,
    tone: string,
    personality: string,
    writingStyle: string,
    targetAudience: string,
    subscriberName: string,
    jsonResponse?: boolean,
    aiProvider: "openai" | "claude" = "openai",
    openaiApiKey?: string,
    anthropicApiKey?: string
  ): Promise<{
    content: string;
    generatedPrompt: string;
    aiProvider: string;
    aiModel: string;
  }> {
    if (aiProvider === "openai" && !openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }

    if (aiProvider === "claude" && !anthropicApiKey) {
      throw new Error("Anthropic API key is required");
    }

    const prompt = await this.generateEmailPrompt(
      productInfo,
      framework,
      tone,
      personality,
      writingStyle,
      targetAudience,
      subscriberName
    );

    const assistantProvider = new OpenAIAssistantProvider({
      key: openaiApiKey,
    });
    const response = await assistantProvider.runAssistant(
      EMAIL_MARKETING_ASSISTANT_ID,
      prompt
    );

    return {
      content: response,
      generatedPrompt: prompt,
      aiProvider: "openai",
      aiModel: "gpt-4o-mini",
    };
  }

  private static async generateEmailSubject(
    content: string,
    aiProvider: "openai" | "claude" = "openai",
    openaiApiKey?: string,
    anthropicApiKey?: string
  ): Promise<string> {
    if (aiProvider === "openai" && !openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }

    if (aiProvider === "claude" && !anthropicApiKey) {
      throw new Error("Anthropic API key is required");
    }

    const prompt = `
      Based on this email content, generate a compelling subject line that will maximize open rates:
      ${content}
      
      Requirements:
      1. Keep it under 50 characters
      2. Create curiosity or urgency
      3. Avoid spam trigger words
      4. Make it relevant to the content
    `;

    const aiclient = new FallbackAiProvider({
      openaiKey: openaiApiKey,
      claudeKey: anthropicApiKey,
    });
    const systemPrompt =
      "You are an expert in writing email subject lines that maximize open rates.";
    const result: { content: string } =
      await aiclient.generateSystemPromptContent(systemPrompt, prompt);

    return result.content;
  }

  static async updateCampaignMetrics(
    campaignId: string,
    variantId: string,
    metrics: Partial<ICampaignVariant["metrics"]>
  ) {
    try {
      await Campaign.findOneAndUpdate(
        { _id: campaignId },
        {
          $inc: {
            "metrics.totalSent": metrics.sent || 0,
            "metrics.totalOpens": metrics.opens || 0,
            "metrics.totalClicks": metrics.clicks || 0,
            "metrics.totalConversions": metrics.conversions || 0,
            "metrics.totalRevenue": metrics.revenue || 0,
          },
        }
      );
    } catch (error) {
      logger.error("Error updating campaign metrics:", error);
      throw error;
    }
  }

  static async addSubscriberIdToCampaign(
    campaignId: string,
    subscriberId: string
  ) {
    await Campaign.findByIdAndUpdate(campaignId, {
      $push: { subscriberIds: subscriberId },
    });
  }

  static async sendCampaignEmail(
    offerId: string,
    subscriberId: string,
    campaignId: string,
    smtpProviderId: string,
    emailContent: string,
    subject: string,
    unsubscribeWebsiteUrl: string,
    address: IAddress,
    companyName: string,
    senderName: string,
    senderEmail: string
  ) {
    try {
      const offer = await AffiliateOffer.findById(offerId);
      if (!offer) {
        throw new Error("Offer not found");
      }

      const subscriber = await Subscriber.findById(subscriberId);
      if (!subscriber) {
        throw new Error("Subscriber not found");
      }

      let offerUrl = offer.url;

      const click = await Click.create({
        subscriberId: subscriberId,
        campaignId: campaignId,
        linkId: offer._id as string,
        timestamp: new Date(),
      });
      offerUrl = offerUrl.replace("{clickId}", click._id as string);
      const replacedContent = emailContent
        .replace(/{offer_url}/g, offerUrl)
        .replace(/{subscriberName}/g, subscriber.data?.name || "");

      const replacedSubject = subject.replace(
        /{subscriberName}/g,
        subscriber.data?.name || ""
      );

      const emailWithTracking = EmailTemplateService.addTrackingToTemplate(
        replacedContent,
        subscriberId,
        campaignId,
        click.id
      );

      const emailWithUnsubscribe =
        EmailTemplateService.addUnsubscribeToTemplate(
          emailWithTracking,
          click.id,
          unsubscribeWebsiteUrl,
          address,
          companyName
        );

      await CampaignService.addSubscriberIdToCampaign(campaignId, subscriberId);

      await SmtpService.sendEmail({
        providerId: smtpProviderId,
        to: subscriber.email,
        subject: replacedSubject,
        html: emailWithUnsubscribe,
        senderName,
        senderEmail,
      });

      await CampaignService.updateCampaignMetrics(campaignId, "", {
        sent: 1,
      });
    } catch (error) {
      logger.error("Error sending campaign email:", error);
    }
  }

  static async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus
  ): Promise<ICampaign | null> {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { status },
        { new: true }
      );

      if (!campaign) {
        logger.warn(`Campaign not found for status update: ${campaignId}`);
        return null;
      }

      return campaign;
    } catch (error) {
      logger.error("Error updating campaign status:", error);
      throw error;
    }
  }

  static async generateCustomEmailContent(
    customPrompt: string,
    tone: string,
    style: string,
    openaiApiKey?: string
  ): Promise<string> {
    const prompt = `
      Write a marketing email with the following specifications:
      Custom Instructions: ${customPrompt}
      Tone: ${tone}
      Writing Style: ${style}
      
      Requirements:
      1. Maintain the specified tone and writing style throughout
      2. Include a clear call to action
      3. Keep it concise and engaging
      4. Focus on the specific instructions provided
    `;
    const aiclient = new FallbackAiProvider({
      openaiKey: openaiApiKey,
    });
    const systemPrompt =
      "You are an expert email copywriter skilled at following specific instructions while maintaining consistent tone and style.";
    const result: { content: string } =
      await aiclient.generateSystemPromptContent(systemPrompt, prompt);

    return result.content;
  }

  static async processCampaignSchedule(campaign: ICampaign): Promise<void> {
    try {
      if (!campaign.schedule || campaign.status !== CampaignStatus.SCHEDULED) {
        return;
      }

      const now = new Date();
      const startDate = new Date(campaign.schedule.startDate);
      const endDate = campaign.schedule.endDate
        ? new Date(campaign.schedule.endDate)
        : null;

      if (startDate <= now && (!endDate || endDate >= now)) {
        await this.updateCampaignStatus(
          (campaign as any)._id.toString(),
          CampaignStatus.RUNNING
        );
      }

      if (endDate && endDate < now) {
        await this.updateCampaignStatus(
          (campaign as any)._id.toString(),
          CampaignStatus.COMPLETED
        );
      }
    } catch (error) {
      logger.error("Error processing campaign schedule:", error);
      throw error;
    }
  }

  static async processScheduledCampaigns(): Promise<void> {
    try {
      const scheduledCampaigns = await Campaign.find({
        status: CampaignStatus.SCHEDULED,
      }).lean();

      for (const campaign of scheduledCampaigns) {
        await this.processCampaignSchedule(campaign as ICampaign);
      }
    } catch (error) {
      logger.error("Error processing scheduled campaigns:", error);
      throw error;
    }
  }

  /**
   * Get campaign reports grouped by campaignProcessId
   * Sums metrics (sent, opens, clicks, conversions, revenue) for each group
   * @returns Array of campaign process reports with metrics and child campaigns
   */
  static async getCampaignReports(userId: string) {
    try {
      // Find all campaigns for the user that have a campaignProcessId
      const campaigns = await Campaign.find({
        userId,
        campaignProcessId: { $exists: true, $ne: null },
      }).lean();

      // Get all campaign process IDs
      const campaignProcessIds = campaigns
        .map((campaign) => campaign.campaignProcessId)
        .filter(Boolean);

      // Fetch all campaign processes to get their names
      const campaignProcesses = await CampaignProcess.find({
        _id: { $in: campaignProcessIds },
      }).lean();

      // Create a map of campaign process IDs to their names for quick lookup
      const campaignProcessMap = new Map();
      for (const process of campaignProcesses) {
        campaignProcessMap.set(process._id.toString(), {
          name: process.name,
          createdAt: process.createdAt,
        });
      }

      // Get all campaign IDs to query for unsubscribes
      const campaignIds = campaigns.map((campaign) => campaign._id);

      // Query subscribers who unsubscribed from these campaigns
      const unsubscribes = await Subscriber.aggregate([
        {
          $match: {
            "metadata.unsubscribeCampaignId": { $in: campaignIds },
            status: "unsubscribed",
          },
        },
        {
          $group: {
            _id: "$metadata.unsubscribeCampaignId",
            unsubscribeCount: { $sum: 1 },
          },
        },
      ]);

      // Create a map of campaign IDs to unsubscribe counts for quick lookup
      const unsubscribeMap = new Map();
      for (const item of unsubscribes) {
        unsubscribeMap.set(item._id.toString(), item.unsubscribeCount);
      }

      // Get all offer IDs from the campaigns
      const offerIds = [
        ...new Set(campaigns.map((campaign) => campaign.offerId)),
      ];

      // Fetch all related offers in a single query
      const offers = await AffiliateOffer.find({
        _id: { $in: offerIds },
      }).lean();

      // Create a map of offer IDs to offer names for quick lookup
      const offerMap = new Map();
      for (const offer of offers) {
        offerMap.set(offer._id.toString(), offer.name);
      }

      // Group campaigns by campaignProcessId and sum metrics
      const reportMap = new Map();

      for (const campaign of campaigns) {
        const campaignProcessId = campaign.campaignProcessId?.toString();
        const campaignId = campaign._id.toString();

        if (!campaignProcessId) continue;

        if (!reportMap.has(campaignProcessId)) {
          reportMap.set(campaignProcessId, {
            campaignProcessId,
            campaignProcessName:
              campaignProcessMap.get(campaignProcessId)?.name || "Unknown",
            campaignCount: 0,
            metrics: {
              totalSent: 0,
              totalOpens: 0,
              totalClicks: 0,
              totalConversions: 0,
              totalRevenue: 0,
              totalUnsubscribes: 0,
            },
            createdAt:
              campaignProcessMap.get(campaignProcessId)?.createdAt || "",
            children: [], // Array to store all campaigns belonging to this process
          });
        }

        const report = reportMap.get(campaignProcessId);
        report.campaignCount += 1;

        // Get the offer name from the map
        const offerId = campaign.offerId?.toString();
        const offerName = offerId
          ? offerMap.get(offerId) || "Unknown Offer"
          : "Unknown Offer";

        // Get unsubscribe count for this campaign
        const unsubscribeCount = unsubscribeMap.get(campaignId) || 0;

        // Add campaign to the children array with additional fields
        report.children.push({
          id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          subject: campaign.subject,
          content: campaign.content,
          framework: campaign.framework || "",
          tone: campaign.tone || "",
          writingStyle: campaign.writingStyle || "",
          personality: campaign.personality || "",
          offerName: offerName,
          unsubscribeCount: unsubscribeCount,
          metrics: campaign.metrics || {
            totalSent: 0,
            totalOpens: 0,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
          },
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        });

        // Sum metrics if they exist
        if (campaign.metrics) {
          report.metrics.totalSent += campaign.metrics.totalSent || 0;
          report.metrics.totalOpens += campaign.metrics.totalOpens || 0;
          report.metrics.totalClicks += campaign.metrics.totalClicks || 0;
          report.metrics.totalConversions +=
            campaign.metrics.totalConversions || 0;
          report.metrics.totalRevenue += campaign.metrics.totalRevenue || 0;
        }

        // Add unsubscribe count to total metrics
        report.metrics.totalUnsubscribes += unsubscribeCount;
      }

      // Convert map to array
      return Array.from(reportMap.values());
    } catch (error) {
      logger.error("Error getting campaign reports:", error);
      throw error;
    }
  }

  /**
   * Get campaign analytics grouped by writing style, tone, and framework
   * Calculates sum of clicks and conversions for each group
   */
  static async getCampaignAnalytics(userId: string) {
    try {
      // Find all campaigns for the user
      const campaigns = await Campaign.find({
        userId,
      }).lean();

      // Initialize analytics objects
      const writingStyleAnalytics = new Map();
      const toneAnalytics = new Map();
      const frameworkAnalytics = new Map();
      const personalityAnalytics = new Map();

      // Process each campaign
      for (const campaign of campaigns) {
        // Extract metrics (default to 0 if not present)
        const clicks = campaign.metrics?.totalClicks || 0;
        const conversions = campaign.metrics?.totalConversions || 0;

        // Process writing style
        const writingStyle = campaign.writingStyle || "Unknown";
        if (!writingStyleAnalytics.has(writingStyle)) {
          writingStyleAnalytics.set(writingStyle, {
            writingStyle,
            totalClicks: 0,
            totalConversions: 0,
            campaignCount: 0,
          });
        }
        const styleStats = writingStyleAnalytics.get(writingStyle);
        styleStats.totalClicks += clicks;
        styleStats.totalConversions += conversions;
        styleStats.campaignCount += 1;

        // Process tone
        const tone = campaign.tone || "Unknown";
        if (!toneAnalytics.has(tone)) {
          toneAnalytics.set(tone, {
            tone,
            totalClicks: 0,
            totalConversions: 0,
            campaignCount: 0,
          });
        }
        const toneStats = toneAnalytics.get(tone);
        toneStats.totalClicks += clicks;
        toneStats.totalConversions += conversions;
        toneStats.campaignCount += 1;

        // Process framework
        const framework = campaign.framework || "Unknown";
        if (!frameworkAnalytics.has(framework)) {
          frameworkAnalytics.set(framework, {
            framework,
            totalClicks: 0,
            totalConversions: 0,
            campaignCount: 0,
          });
        }
        const frameworkStats = frameworkAnalytics.get(framework);
        frameworkStats.totalClicks += clicks;
        frameworkStats.totalConversions += conversions;
        frameworkStats.campaignCount += 1;

        // Process personality
        const personality = campaign.personality || "Unknown";
        if (!personalityAnalytics.has(personality)) {
          personalityAnalytics.set(personality, {
            personality,
            totalClicks: 0,
            totalConversions: 0,
            campaignCount: 0,
          });
        }
        const personalityStats = personalityAnalytics.get(personality);
        personalityStats.totalClicks += clicks;
        personalityStats.totalConversions += conversions;
        personalityStats.campaignCount += 1;
      }

      // Sort analytics by effectiveness
      const processAnalytics = (
        analyticsMap: Map<
          string,
          {
            totalClicks: number;
            totalConversions: number;
            campaignCount: number;
            [key: string]: any;
          }
        >
      ) => {
        return Array.from(analyticsMap.values()).sort(
          (a, b) => b.totalConversions - a.totalConversions
        );
      };

      // Return the analytics data
      return {
        byWritingStyle: processAnalytics(writingStyleAnalytics),
        byTone: processAnalytics(toneAnalytics),
        byFramework: processAnalytics(frameworkAnalytics),
        byPersonality: processAnalytics(personalityAnalytics),
      };
    } catch (error) {
      logger.error("Error getting campaign analytics:", error);
      throw error;
    }
  }
}
