import OpenAI from "openai";
import {
  Campaign,
  ICampaign,
  ICampaignVariant,
  CampaignStatus,
} from "./models/campaign.model";
import { logger } from "@config/logger";
import { OPENAI_API_KEY } from "@/local";
import { EmailTemplateService } from "@features/email/templates/email-template.service";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { Document } from "mongoose";
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { Click } from "../tracking/models/click.model";
import { AffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { Subscriber } from "../subscriber/models/subscriber.model";

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
  private static openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

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

  static async generateEmailVariants(
    campaignId: string,
    productInfo: any,
    numberOfVariants: number = 2
  ): Promise<ICampaignVariant[]> {
    try {
      const variants: ICampaignVariant[] = [];

      for (let i = 0; i < numberOfVariants; i++) {
        const framework =
          COPYWRITING_FRAMEWORKS[
            Math.floor(Math.random() * COPYWRITING_FRAMEWORKS.length)
          ];
        const tone =
          WRITING_TONES[Math.floor(Math.random() * WRITING_TONES.length)];
        const personality =
          PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
        const writingStyle =
          WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];

        const content = await this.generateEmailContent(
          productInfo,
          framework,
          tone,
          personality,
          writingStyle
        );
        const subject = await this.generateEmailSubject(content);

        variants.push({
          subject,
          content,
          tone,
          personality,
          writingStyle,
          metrics: {
            opens: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0,
          },
        } as ICampaignVariant);
      }

      await Campaign.findByIdAndUpdate(campaignId, {
        $push: { variants: { $each: variants } },
      });

      return variants;
    } catch (error) {
      logger.error("Error generating email variants:", error);
      throw error;
    }
  }

  public static async generateEmailContent(
    productInfo: any,
    framework: string,
    tone: string,
    personality: string,
    writingStyle: string,
    extraInstructions?: string,
    jsonResponse?: boolean
  ): Promise<string> {
    const prompt = `
      Write a marketing email using the ${framework} framework.
      Product Information: ${JSON.stringify(productInfo)}
      Tone: ${tone}
      Personality: ${personality}
      Writing Style: ${writingStyle}
      ${
        extraInstructions ? `Additional Instructions: ${extraInstructions}` : ""
      }
      
      Requirements:
      1. Follow the ${framework} structure strictly
      2. Maintain the specified tone and personality throughout
      3. Include a clear call to action
      4. Keep it concise and engaging
      5. Focus on benefits and value proposition
    `;

    const gptParams: ChatCompletionCreateParamsNonStreaming = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert email copywriter with deep knowledge of marketing frameworks and psychology.",
        },
        { role: "user", content: prompt },
      ],
    };

    if (jsonResponse) {
      gptParams.response_format = { type: "json_object" };
    }

    const completion = await this.openai.chat.completions.create(gptParams);

    return completion.choices[0].message?.content || "";
  }

  private static async generateEmailSubject(content: string): Promise<string> {
    const prompt = `
      Based on this email content, generate a compelling subject line that will maximize open rates:
      ${content}
      
      Requirements:
      1. Keep it under 50 characters
      2. Create curiosity or urgency
      3. Avoid spam trigger words
      4. Make it relevant to the content
    `;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in writing email subject lines that maximize open rates.",
        },
        { role: "user", content: prompt },
      ],
    });

    return completion.choices[0].message?.content || "";
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

  static async sendCampaignEmail(
    offerId: string,
    subscriberId: string,
    campaignId: string,
    smtpProviderId: string,
    emailContent: string,
    subject: string
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
      if (!offerUrl.includes("{clickId}")) {
        const urlObj = new URL(offerUrl);
        urlObj.searchParams.append("clickId", "{clickId}");
        offerUrl = urlObj.toString();
      }

      const click = await Click.create({
        subscriberId: subscriberId,
        campaignId: campaignId,
        linkId: offer._id as string,
        timestamp: new Date(),
      });
      offerUrl = offerUrl.replace("{clickId}", click._id as string);
      const replacedContent = emailContent.replace("{offer_url}", offerUrl);

      const emailWithTracking = EmailTemplateService.addTrackingToTemplate(
        replacedContent,
        subscriberId,
        campaignId
      );

      await SmtpService.sendEmail({
        providerId: smtpProviderId,
        to: subscriber.email,
        subject: subject,
        html: emailWithTracking,
      });

      await CampaignService.updateCampaignMetrics(campaignId, "", {
        sent: 1,
      });
    } catch (error) {
      logger.error("Error sending campaign email:", error);
      throw error;
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
    style: string
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

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an expert email copywriter skilled at following specific instructions while maintaining consistent tone and style.",
        },
        { role: "user", content: prompt },
      ],
    });

    return completion.choices[0].message?.content || "";
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
}
