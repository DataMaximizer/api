import {
	SmsTemplate,
	SmsProvider,
	SmsCampaign,
	ISmsProvider,
} from "../models/sms-campaign.model";
import { Subscriber } from "../models/subscriber.model";
import { logger } from "../config/logger";
import twilio from "twilio";
import { MessageBird } from "messagebird";

interface SendSMSParams {
	to: string;
	content: string;
	providerId: string;
	campaignId?: string;
}

interface SmsProviderConfig {
	apiKey: string;
	apiSecret: string;
	senderId: string;
}

export class SmsService {
	private static providers = new Map<string, any>();

	static async initializeProvider(provider: ISmsProvider): Promise<void> {
		try {
			switch (provider.type.toLowerCase()) {
				case "twilio":
					this.providers.set(
						provider._id.toString(),
						twilio(provider.apiKey, provider.apiSecret),
					);
					break;
				case "messagebird":
					this.providers.set(
						provider._id.toString(),
						new MessageBird(provider.apiKey),
					);
					break;
				default:
					throw new Error(`Unsupported SMS provider type: ${provider.type}`);
			}
		} catch (error) {
			logger.error(
				`Failed to initialize SMS provider: ${provider.name}`,
				error,
			);
			throw error;
		}
	}

	static async sendSMS({
		to,
		content,
		providerId,
		campaignId,
	}: SendSMSParams): Promise<string> {
		try {
			const provider = await SmsProvider.findById(providerId);
			if (!provider) {
				throw new Error("SMS provider not found");
			}

			if (!this.providers.has(providerId)) {
				await this.initializeProvider(provider);
			}

			const providerInstance = this.providers.get(providerId);
			let messageId: string;

			switch (provider.type.toLowerCase()) {
				case "twilio":
					const twilioResponse = await providerInstance.messages.create({
						body: content,
						from: provider.senderId,
						to: to,
					});
					messageId = twilioResponse.sid;
					break;

				case "messagebird":
					const messagebirdResponse = await new Promise((resolve, reject) => {
						providerInstance.messages.create(
							{
								originator: provider.senderId,
								recipients: [to],
								body: content,
							},
							(err: any, response: any) => {
								if (err) reject(err);
								resolve(response);
							},
						);
					});
					messageId = (messagebirdResponse as any).id;
					break;

				default:
					throw new Error(`Unsupported SMS provider type: ${provider.type}`);
			}

			if (campaignId) {
				await SmsCampaign.findByIdAndUpdate(campaignId, {
					$inc: { "metrics.sent": 1 },
				});
			}

			return messageId;
		} catch (error) {
			logger.error("Error sending SMS:", error);
			throw error;
		}
	}

	static async createTemplate(data: Partial<any>): Promise<any> {
		try {
			return await SmsTemplate.create(data);
		} catch (error) {
			logger.error("Error creating SMS template:", error);
			throw error;
		}
	}

	static async createCampaign(campaignData: Partial<any>): Promise<any> {
		try {
			const campaign = await SmsCampaign.create(campaignData);
			return campaign;
		} catch (error) {
			logger.error("Error creating SMS campaign:", error);
			throw error;
		}
	}

	static async executeCampaign(campaignId: string): Promise<void> {
		try {
			const campaign = await SmsCampaign.findById(campaignId)
				.populate("template")
				.populate("provider");

			if (!campaign) {
				throw new Error("Campaign not found");
			}

			const subscribers = await Subscriber.find({
				_id: { $in: campaign.segments },
				status: "active",
			}).select("phone");

			for (const subscriber of subscribers) {
				try {
					await this.sendSMS({
						to: subscriber.phone,
						content: campaign.template.content,
						providerId: campaign.provider._id,
						campaignId: campaign._id,
					});
				} catch (error) {
					logger.error(
						`Failed to send SMS to subscriber ${subscriber._id}:`,
						error,
					);
					continue;
				}
			}

			await SmsCampaign.findByIdAndUpdate(campaignId, {
				status: "completed",
			});
		} catch (error) {
			logger.error("Error executing SMS campaign:", error);
			throw error;
		}
	}

	static async validateProvider(providerId: string): Promise<boolean> {
		try {
			const provider = await SmsProvider.findById(providerId);
			if (!provider) return false;

			await this.initializeProvider(provider);

			// Test message to a test number could be implemented here
			// For now, we just verify we can initialize the provider

			return true;
		} catch (error) {
			logger.error("Error validating SMS provider:", error);
			return false;
		}
	}
}
