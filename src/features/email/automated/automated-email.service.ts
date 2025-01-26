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
		targetAudience: string,
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

		return {
			framework: ContentFramework.AIDA,
			tone: WritingTone.FRIENDLY,
			style: "Conversational and engaging",
		};
	}

	static async processUrlAndGenerateEmail(
		url: string,
		commissionRate: number,
		userId: string,
		subscriberListId: string,
		smtpProviderId: string,
		res?: Response,
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
			);

			// 2. Enhance tags generation
			const productInfo = offerData.productInfo as ProductInfo;
			const additionalTags =
				await AIContentService.generateAdditionalTags(productInfo);

			const tags = offerData.tags || [];
			offerData.tags = [...new Set([...tags, ...(additionalTags || [])])];

			// 3. Save the offer
			const offer = await AffiliateOffer.create(offerData);

			// 4. Determine content strategy based on target audience
			const contentStrategy = this.determineContentStrategy(
				productInfo.targetAudience || "general",
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
				1,
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
				content: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				framework: contentStrategy.framework,
				tone: contentStrategy.tone,
				smtpProviderId: new Types.ObjectId(smtpProviderId),
				segments: [new Types.ObjectId(subscriberListId)],
			})) as ICampaignWithId;

			// 7. Send email to subscriber list
			const subscribers = await Subscriber.find({
				lists: new Types.ObjectId(subscriberListId),
				status: "active",
			});

			emailContent[0].content += `<a href="${offer.url}">Learn More</a>`;

			for (const subscriber of subscribers) {
				const emailWithTracking = EmailTemplateService.addTrackingToTemplate(
					emailContent[0].content,
					subscriber._id.toString(),
					campaign._id.toString(),
				);

				await SmtpService.sendEmail({
					providerId: smtpProviderId,
					to: subscriber.email,
					subject: "aaaaaaaaaaaa",
					html: emailWithTracking,
				});
			}

			logger.info(
				`Automated email campaign created and sent for offer: ${offer._id}`,
			);
		} catch (error) {
			logger.error("Error in processUrlAndGenerateEmail:", error);
			throw error;
		}
	}
}
