import { UrlAnalysisService } from "@features/url-analysis/url-analysis.service";
import { AIContentService } from "@features/ai/content/ai-content.service";
import { EmailTemplateService } from "@features/email/templates/email-template.service";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { AffiliateOffer } from "@features/affiliate/models/affiliate-offer.model";
import { Campaign, ICampaign } from "@features/campaign/models/campaign.model";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import {
  ContentFramework,
  WritingTone,
} from "@features/ai/models/ai-content.model";
import { Document, Types } from "mongoose";
import { logger } from "@config/logger";
import { Response } from "express";
import { Click } from "@features/tracking/models/click.model";
import { CampaignService } from "@features/campaign/campaign.service";
import { availableRecommendedStyles } from "@features/ai/agents/writing-style/WritingStyleOptimizationAgent";
import { BlockedEmail } from "@/features/subscriber/models/blocked-email.model";

interface ContentStrategy {
  framework: ContentFramework;
  tone: WritingTone;
  style: string;
}

interface ICampaignWithId extends ICampaign, Document {
  _id: Types.ObjectId;
}

interface ProductInfo {
  targetAudience: string;
  benefits: string[];
  description: string;
  [key: string]: any;
}

export class AutomatedEmailService {
  private static determineContentStrategy(
    targetAudience: string
  ): ContentStrategy {
    const audienceLower = targetAudience.toLowerCase();

    if (
      audienceLower.includes("business") ||
      audienceLower.includes("professional")
    ) {
      return {
        framework: ContentFramework.BAB,
        tone: WritingTone.PROFESSIONAL,
        style: "Direct and analytical",
      };
    }

    if (audienceLower.includes("tech") || audienceLower.includes("developer")) {
      return {
        framework: ContentFramework.FOUR_PS,
        tone: WritingTone.CASUAL,
        style: "Technical and specific",
      };
    }

    // In the default scenario, choose a random tone from WritingTone.
    const tones = Object.values(WritingTone).filter(
      (value) => typeof value === "string"
    ) as string[];
    const randomTone = tones[Math.floor(Math.random() * tones.length)];

    // Also select a random style from availableRecommendedStyles.
    const randomStyleIndex = Math.floor(
      Math.random() * availableRecommendedStyles.length
    );
    const randomStyle = availableRecommendedStyles[randomStyleIndex];

    return {
      framework: ContentFramework.AIDA,
      tone: randomTone as WritingTone,
      style: randomStyle,
    };
  }

  static async processUrlAndGenerateEmail(
    url: string,
    commissionRate: number,
    userId: string,
    subscriberListId: string,
    smtpProviderId: string,
    res?: Response,
    parameters?: { type: string; name: string; placeholder: string }[]
  ): Promise<void> {
    try {
      if (res) {
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
      }
      // 1. Analyze URL and create offer
      const offerData = await UrlAnalysisService.createOfferFromUrl(
        url,
        userId,
        commissionRate,
        parameters ?? []
      );

      // 2. Enhance tags generation
      const productInfo = offerData.productInfo as ProductInfo;
      const additionalTags = await AIContentService.generateAdditionalTags(
        productInfo
      );

      const tags = offerData.tags || [];
      offerData.tags = [...new Set([...tags, ...(additionalTags || [])])];

      // 3. Save the offer
      const offerDataWithParameters = {
        ...offerData,
        parameters: parameters || [],
      };
      const offer = await AffiliateOffer.create(offerDataWithParameters);

      // 4. Determine content strategy based on target audience
      const contentStrategy = this.determineContentStrategy(
        productInfo.targetAudience || "general"
      );

      // 5. Generate email content
      const emailContent = await AIContentService.generateContentVariants(
        {
          name: offer.name,
          description: offer.description,
          productInfo,
          tags: offer.tags || [],
          targetAudience: productInfo.targetAudience,
          benefits: productInfo.benefits || [],
        },
        contentStrategy.framework,
        contentStrategy.tone,
        1
      );

      if (!emailContent || emailContent.length === 0) {
        throw new Error("Failed to generate email content");
      }

      // 6. Create campaign
      const campaign = (await Campaign.create({
        name: `Automated Campaign - ${offer.name}`,
        type: "email",
        status: "scheduled",
        userId: new Types.ObjectId(userId),
        offerId: offer._id,
        subject: emailContent[0].subject || "",
        content: emailContent[0].content,
        framework: contentStrategy.framework,
        tone: contentStrategy.tone,
        writingStyle: contentStrategy.style,
        smtpProviderId: new Types.ObjectId(smtpProviderId),
        segments: [new Types.ObjectId(subscriberListId)],
      })) as ICampaignWithId;

      // 7. Send email to subscriber list
      const blockedEmails = await BlockedEmail.find({
        userId: new Types.ObjectId(userId),
      }).distinct("email");
      const blockedEmailSet = new Set(
        blockedEmails.map((email) => email.toLowerCase())
      );

      const subscribers = await Subscriber.find({
        lists: new Types.ObjectId(subscriberListId),
        status: "active",
        email: { $nin: blockedEmails },
      });

      for (const subscriber of subscribers) {
        let trackingUrl = offer.url;
        const click = await Click.create({
          subscriberId: subscriber._id,
          campaignId: campaign._id,
          linkId: offer._id as string,
          timestamp: new Date(),
        });
        trackingUrl = trackingUrl.replace("{clickId}", click._id as string);

        emailContent[0].content += `<a href="${trackingUrl}">Learn More</a>`;

        const emailWithTracking = EmailTemplateService.addTrackingToTemplate(
          emailContent[0].content,
          subscriber._id as string,
          campaign._id.toString(),
          click.id
        );

        await SmtpService.sendEmail({
          providerId: smtpProviderId,
          to: subscriber.email,
          subject: emailContent[0].subject || "New Offer",
          html: emailWithTracking,
        });

        await CampaignService.updateCampaignMetrics(
          campaign._id.toString(),
          "",
          { sent: 1 }
        );
      }

      logger.info(
        `Automated email campaign created and sent for offer: ${offer._id}`
      );
    } catch (error) {
      logger.error("Error in processUrlAndGenerateEmail:", error);
      throw error;
    }
  }

  static async getHistory(userId: string) {
    try {
      const campaigns = await Campaign.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            type: "email",
          },
        },
        {
          $lookup: {
            from: "affiliateoffers",
            localField: "offerId",
            foreignField: "_id",
            as: "offer",
          },
        },
        {
          $unwind: "$offer",
        },
        {
          $lookup: {
            from: "metrics",
            let: { campaignId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$campaignId", "$$campaignId"],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  opens: {
                    $sum: { $cond: [{ $eq: ["$type", "open"] }, 1, 0] },
                  },
                  clicks: {
                    $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] },
                  },
                  conversions: {
                    $sum: { $cond: [{ $eq: ["$type", "conversion"] }, 1, 0] },
                  },
                },
              },
            ],
            as: "metrics",
          },
        },
        {
          $project: {
            taskId: "$_id",
            url: "$offer.url",
            offerId: "$offerId",
            campaignId: "$_id",
            sentAt: "$createdAt",
            sentTo: "$sent",
            metrics: {
              $cond: [
                { $gt: [{ $size: "$metrics" }, 0] },
                { $arrayElemAt: ["$metrics", 0] },
                {
                  opens: 0,
                  clicks: 0,
                  conversions: 0,
                },
              ],
            },
          },
        },
        {
          $sort: { sentAt: -1 },
        },
      ]);

      return campaigns;
    } catch (error) {
      logger.error("Error fetching automated email history:", error);
      throw error;
    }
  }
}
