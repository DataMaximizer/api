import axios from "axios";
import OpenAI from "openai";
import { FilterQuery, QueryOptions } from "mongoose";
import {
	AffiliateOffer,
	OfferStatus,
	IAffiliateOffer,
} from "../models/affiliate-offer.model";
import { logger } from "../config/logger";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export class AffiliateService {
	static async createOffer(offerData: Partial<IAffiliateOffer>) {
		const offer = new AffiliateOffer(offerData);
		await this.scanAndEnrichOffer(offer);
		return offer.save();
	}

	static async scanAndEnrichOffer(offer: IAffiliateOffer) {
		try {
			// Check if URL is alive
			const isAlive = await this.checkUrlStatus(offer.url);
			if (!isAlive) {
				offer.status = OfferStatus.PAUSED;
				return;
			}

			// Gather product information using OpenAI
			const productInfo = await this.gatherProductInfo(offer.url);
			offer.productInfo = productInfo;

			// Auto-generate tags
			const tags = await this.generateTags(productInfo);
			offer.tags = [...new Set([...offer.tags, ...tags])];

			offer.lastChecked = new Date();
			offer.lastActive = new Date();
		} catch (error) {
			logger.error("Error enriching offer:", error);
			throw error;
		}
	}

	static async checkUrlStatus(url: string): Promise<boolean> {
		try {
			const response = await axios.head(url, { timeout: 5000 });
			return response.status >= 200 && response.status < 400;
		} catch (error) {
			return false;
		}
	}

	static async gatherProductInfo(url: string) {
		try {
			const response = await axios.get(url);
			const content = response.data;

			const prompt = `
        Analyze this product page content and extract the following information:
        1. Product description
        2. Key benefits (as bullet points)
        3. Pricing information
        4. Target audience
        
        Content: ${content.substring(0, 2000)}
      `;

			const completion = await openai.chat.completions.create({
				model: "gpt-3.5-turbo",
				messages: [{ role: "user", content: prompt }],
			});

			const result = completion.choices[0].message?.content;
			if (!result) throw new Error("No response from OpenAI");

			// Parse the response into structured data
			const sections = result.split("\n\n");
			return {
				description: sections[0],
				benefits: sections[1]?.split("\n").filter((b: string) => b.trim()),
				pricing: sections[2],
				targetAudience: sections[3],
			};
		} catch (error) {
			logger.error("Error gathering product info:", error);
			return {};
		}
	}

	static async generateTags(
		productInfo: Record<string, any>,
	): Promise<string[]> {
		try {
			const prompt = `
        Generate relevant tags based on this product information:
        ${JSON.stringify(productInfo)}
        
        Return only a comma-separated list of tags.
      `;

			const completion = await openai.chat.completions.create({
				model: "gpt-3.5-turbo",
				messages: [{ role: "user", content: prompt }],
			});

			const tags = completion.choices[0].message?.content?.split(",") || [];
			return tags.map((tag: string) => tag.trim().toLowerCase());
		} catch (error) {
			logger.error("Error generating tags:", error);
			return [];
		}
	}

	static async updateOffer(id: string, updateData: Partial<IAffiliateOffer>) {
		const offer = await AffiliateOffer.findById(id);
		if (!offer) throw new Error("Offer not found");

		// If URL changed, rescan and enrich
		if (updateData.url && updateData.url !== offer.url) {
			offer.url = updateData.url;
			await this.scanAndEnrichOffer(offer);
		}

		Object.assign(offer, updateData);
		return offer.save();
	}

	static async getOffers(
		filters: FilterQuery<IAffiliateOffer> = {},
		options: QueryOptions = {},
	) {
		try {
			return await AffiliateOffer.find(filters, null, options);
		} catch (error) {
			logger.error("Error in getOffers:", error);
			throw error;
		}
	}

	static async getOfferById(id: string) {
		try {
			return await AffiliateOffer.findById(id);
		} catch (error) {
			logger.error("Error in getOfferById:", error);
			throw error;
		}
	}

	static async deleteOffer(id: string) {
		try {
			return await AffiliateOffer.findByIdAndUpdate(
				id,
				{ status: "deleted" },
				{ new: true },
			);
		} catch (error) {
			logger.error("Error in deleteOffer:", error);
			throw error;
		}
	}

	static async validateOffers() {
		const offers = await AffiliateOffer.find({ status: OfferStatus.ACTIVE });

		for (const offer of offers) {
			const isAlive = await this.checkUrlStatus(offer.url);
			if (!isAlive) {
				offer.status = OfferStatus.PAUSED;
				await offer.save();
				logger.warn(`Offer ${offer._id} paused due to invalid URL`);
			}
		}
	}
}
