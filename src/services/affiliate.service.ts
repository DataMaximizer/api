import axios from "axios";
import OpenAI from "openai";
import { FilterQuery, QueryOptions } from "mongoose";
import {
	AffiliateOffer,
	OfferStatus,
	IAffiliateOffer,
} from "../models/affiliate-offer.model";
import { logger } from "../config/logger";
import { load } from "cheerio";
import { OfferEnhancementService } from "./offer-enhancement.service";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export class AffiliateService {
	static async createOffer(offerData: Partial<IAffiliateOffer>) {
		const enhancedOfferData =
			await OfferEnhancementService.enhanceOfferDescription(offerData);

		const offer = new AffiliateOffer(enhancedOfferData);

		offer.categories = OfferEnhancementService.validateCategories(
			offer.categories,
		);

		if (offer.tags && offer.tags.length > 3) {
			offer.tags = offer.tags.slice(0, 3);
		}

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

			// Scrape webpage content
			const pageContent = await this.scrapeWebpage(offer.url);

			// Gather product information using OpenAI
			const productInfo = await this.gatherProductInfo(
				pageContent,
				offer.description,
			);
			offer.productInfo = productInfo;

			// Auto-generate tags and merge with user tags (up to 5 total)
			const aiTags = await this.generateTags(productInfo);
			const uniqueTags = new Set([...offer.tags, ...aiTags]);
			offer.tags = Array.from(uniqueTags).slice(0, 5);

			offer.lastChecked = new Date();
			offer.lastActive = new Date();
		} catch (error) {
			logger.error("Error enriching offer:", error);
			throw error;
		}
	}

	private static async scrapeWebpage(url: string): Promise<string> {
		try {
			const response = await axios.get(url);
			const $ = load(response.data);

			// Remove scripts, styles, and other non-content elements
			$("script").remove();
			$("style").remove();

			// Extract relevant content
			const title = $("title").text();
			const description = $('meta[name="description"]').attr("content") || "";
			const mainContent = $(
				"main, article, .product-description, #product-description",
			).text();
			const price = $('.price, .product-price, [class*="price"]')
				.first()
				.text();

			return `
        Title: ${title.trim()}
        Description: ${description.trim()}
        Price: ${price.trim()}
        Content: ${mainContent.trim()}
      `.substring(0, 3000); // Limit content length for OpenAI
		} catch (error) {
			logger.error("Error scraping webpage:", error);
			return "";
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

	static async gatherProductInfo(pageContent: string, userDescription: string) {
		try {
			const prompt = `
        Analyze this product page content and extract the following information in a clear, structured format:

        Current user description: "${userDescription}"

        Please provide:
        1. An enhanced product description (improve the user description if possible)
        2. List 3-5 key benefits (as bullet points)
        3. Clear pricing information
        4. Target audience description
        5. Suggest 2-3 best categories for this product

        Product Content:
        ${pageContent}

        Return the response in this exact format:
        Description: [enhanced description]
        Benefits:
        - [benefit 1]
        - [benefit 2]
        - [benefit 3]
        Pricing: [pricing info]
        Target Audience: [audience description]
        Categories: [category1, category2, category3]
      `;

			const completion = await openai.chat.completions.create({
				model: "gpt-3.5-turbo",
				messages: [
					{
						role: "system",
						content:
							"You are a product analysis expert. Provide concise, accurate information focused on key selling points and target audience.",
					},
					{ role: "user", content: prompt },
				],
			});

			const result = completion.choices[0].message?.content;
			if (!result) throw new Error("No response from OpenAI");

			// Parse the structured response
			const sections = result.split("\n\n");
			const benefitsSection =
				sections.find((s) => s.startsWith("Benefits:")) || "";
			const benefits = benefitsSection
				.split("\n")
				.filter((line) => line.startsWith("-"))
				.map((line) => line.replace("-", "").trim());

			return {
				description: sections[0].replace("Description:", "").trim(),
				benefits,
				pricing: sections
					.find((s) => s.startsWith("Pricing:"))
					?.replace("Pricing:", "")
					.trim(),
				targetAudience: sections
					.find((s) => s.startsWith("Target Audience:"))
					?.replace("Target Audience:", "")
					.trim(),
				suggestedCategories: sections
					.find((s) => s.startsWith("Categories:"))
					?.replace("Categories:", "")
					.trim()
					.split(",")
					.map((c) => c.trim()),
			};
		} catch (error) {
			logger.error("Error gathering product info:", error);
			return {
				description: userDescription,
				benefits: [],
				pricing: "",
				targetAudience: "",
				suggestedCategories: [],
			};
		}
	}

	static async generateTags(
		productInfo: Record<string, any>,
	): Promise<string[]> {
		try {
			const prompt = `
        Based on this product information, generate up to 5 relevant tags.
        Product info: ${JSON.stringify(productInfo)}
        
        Rules:
        1. Return ONLY a comma-separated list of tags
        2. Each tag should be 1-2 words maximum
        3. Focus on product category, features, and target audience
        4. Use common e-commerce terminology
        5. Keep it concise and relevant
      `;

			const completion = await openai.chat.completions.create({
				model: "gpt-3.5-turbo",
				messages: [
					{
						role: "system",
						content:
							"You are a product tagging expert. Return only the requested tags, nothing else.",
					},
					{ role: "user", content: prompt },
				],
			});

			const tags = completion.choices[0].message?.content?.split(",") || [];
			return tags
				.map((tag: string) => tag.trim().toLowerCase())
				.filter((tag: string) => tag.length > 0)
				.slice(0, 5);
		} catch (error) {
			logger.error("Error generating tags:", error);
			return [];
		}
	}

	static async updateOffer(id: string, updateData: Partial<IAffiliateOffer>) {
		const offer = await AffiliateOffer.findById(id);
		if (!offer) throw new Error("Offer not found");

		if (updateData.description || updateData.categories) {
			const enhancedData =
				await OfferEnhancementService.enhanceOfferDescription({
					...offer.toObject(),
					...updateData,
				});
			updateData = { ...updateData, ...enhancedData };
		}

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
