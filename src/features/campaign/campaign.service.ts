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
    campaignData: Partial<ICampaign>,
  ): Promise<ICampaign> {
    try {
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
    numberOfVariants: number = 2,
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
          writingStyle,
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

  private static async generateEmailContent(
    productInfo: any,
    framework: string,
    tone: string,
    personality: string,
    writingStyle: string,
  ): Promise<string> {
    const prompt = `
      Write a marketing email using the ${framework} framework.
      Product Information: ${JSON.stringify(productInfo)}
      Tone: ${tone}
      Personality: ${personality}
      Writing Style: ${writingStyle}
      
      Requirements:
      1. Follow the ${framework} structure strictly
      2. Maintain the specified tone and personality throughout
      3. Include a clear call to action
      4. Keep it concise and engaging
      5. Focus on benefits and value proposition
    `;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an expert email copywriter with deep knowledge of marketing frameworks and psychology.",
        },
        { role: "user", content: prompt },
      ],
    });

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
    metrics: Partial<ICampaignVariant["metrics"]>,
  ) {
    try {
      await Campaign.findOneAndUpdate(
        { _id: campaignId, "variants._id": variantId },
        {
          $inc: {
            "variants.$.metrics.opens": metrics.opens || 0,
            "variants.$.metrics.clicks": metrics.clicks || 0,
            "variants.$.metrics.conversions": metrics.conversions || 0,
            "variants.$.metrics.revenue": metrics.revenue || 0,
            "metrics.totalOpens": metrics.opens || 0,
            "metrics.totalClicks": metrics.clicks || 0,
            "metrics.totalConversions": metrics.conversions || 0,
            "metrics.totalRevenue": metrics.revenue || 0,
          },
        },
      );
    } catch (error) {
      logger.error("Error updating campaign metrics:", error);
      throw error;
    }
  }

  static async sendCampaignEmail(
    campaign: any,
    subscriber: any,
    template: string,
    data: Record<string, any>,
  ) {
    try {
      let emailContent = EmailTemplateService.createEmailTemplate(template, {
        ...data,
        subscriberEmail: subscriber.email,
        unsubscribeLink: `${process.env.NEXT_PUBLIC_API_URL}/unsubscribe/${subscriber._id}`,
      });

      emailContent = EmailTemplateService.addTrackingToTemplate(
        emailContent,
        subscriber._id,
        campaign._id,
      );

      await SmtpService.sendEmail({
        providerId: campaign.smtpProviderId,
        to: subscriber.email,
        subject: campaign.subject,
        html: emailContent,
      });
    } catch (error) {
      logger.error("Error sending campaign email:", error);
      throw error;
    }
  }

  static async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
  ): Promise<ICampaign | null> {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { status },
        { new: true },
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
}
