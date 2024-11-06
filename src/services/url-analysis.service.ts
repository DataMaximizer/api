import OpenAI from "openai";
import axios from "axios";
import { load } from "cheerio";
import {
	AffiliateOffer,
	IAffiliateOffer,
	OfferStatus,
} from "../models/affiliate-offer.model"; // Removed IProductInfo
import { logger } from "../config/logger";

import {
	PREDEFINED_CATEGORIES,
	CATEGORY_HIERARCHY,
} from "../constants/categories";

import { OPENAI_API_KEY } from "../local";

interface ScrapedData {
	title: string;
	metaDescription: string;
	price: string;
	content: string;
	specifications: Record<string, string>;
}

interface GeneratedContent {
	name: string;
	description: string;
	detailedDescription: string;
	benefits: string[];
	features: string[];
	targetAudience: string;
	categories: string[];
	tags: string[];
}

const openai = new OpenAI({
	apiKey: OPENAI_API_KEY,
});

const predefinedCategories = PREDEFINED_CATEGORIES;

export class UrlAnalysisService {
	static async createOfferFromUrl(
		url: string,
		userId: string,
		commissionRate: number,
	): Promise<Partial<IAffiliateOffer>> {
		try {
			const scrapedData = await this.scrapeWebpage(url);

			const offerContent = await this.generateOfferContent(scrapedData);

			const offerData: Partial<IAffiliateOffer> = {
				name: offerContent.name,
				description: offerContent.description,
				url: url,
				categories: offerContent.categories,
				tags: offerContent.tags || [],
				commissionRate: commissionRate,
				status: OfferStatus.ACTIVE,
				productInfo: {
					description: offerContent.detailedDescription,
					benefits: offerContent.benefits,
					pricing: scrapedData.price,
					targetAudience: offerContent.targetAudience,
					features: offerContent.features,
				},
				userId: userId as any,
				isAdminOffer: false,
				lastChecked: new Date(),
				lastActive: new Date(),
			};

			if (!offerData.name || !offerData.description) {
				throw new Error("Failed to generate required offer content");
			}

			return offerData;
		} catch (error) {
			logger.error("Error creating offer from URL:", error);
			throw error;
		}
	}

	private static async scrapeWebpage(url: string): Promise<ScrapedData> {
		try {
			const response = await axios.get(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; ProductAnalyzer/1.0)",
				},
			});

			const $ = load(response.data);

			$("script, style, noscript, iframe").remove();

			const specifications: Record<string, string> = {};
			$('.specifications, .specs, [class*="specification"]')
				.find("tr")
				.each((_, row) => {
					const key = $(row).find("th").text().trim();
					const value = $(row).find("td").text().trim();
					if (key && value) {
						specifications[key] = value;
					}
				});

			const metaDescription = $('meta[name="description"]').attr("content");

			const priceSelector = $(
				'.price, [class*="price"], [id*="price"]',
			).first();
			const price = priceSelector.length
				? priceSelector.text().trim()
				: "Price not found";

			const contentSelector = $(
				'main, article, [class*="product-description"], [id*="product-description"]',
			);
			const content = contentSelector.length
				? contentSelector.text().trim()
				: "";

			return {
				title: $("title").text().trim() || "Title not found",
				metaDescription: metaDescription ?? "No description available", // Using nullish coalescing
				price,
				content,
				specifications,
			};
		} catch (error) {
			logger.error("Error scraping webpage:", error);
			throw new Error("Failed to scrape product page");
		}
	}

	private static async generateOfferContent(
		scrapedData: ScrapedData,
	): Promise<GeneratedContent> {
		const prompt = `
      Analyze this product information and create a complete offer listing:

      Title: ${scrapedData.title}
      Meta Description: ${scrapedData.metaDescription}
      Price: ${scrapedData.price}
      Content: ${scrapedData.content.substring(0, 2000)}

      Create an e-commerce offer with the following (All fields are REQUIRED):

      1. Product Name (max 100 chars, catchy and descriptive)
      2. Short Marketing Description (max 200 chars)
      3. Detailed Description (comprehensive but concise)
      4. 3-5 Key Benefits (bullet points)
      5. 3-5 Main Features (bullet points)
      6. Target Audience Description
      7. 3-5 Most Relevant Categories from this list ONLY: ${PREDEFINED_CATEGORIES.join(", ")}
      8. 5-8 Relevant Tags (short, 1-2 words each, highly relevant for search and categorization)

      Format response as JSON with these exact keys:
      {
        "name": "string",
        "description": "string",
        "detailedDescription": "string",
        "benefits": ["string"],
        "features": ["string"],
        "targetAudience": "string",
        "categories": ["string"],
        "tags": ["string"]
      }
    `;

		try {
			const completion = await openai.chat.completions.create({
				model: "gpt-4-turbo",
				messages: [
					{
						role: "system",
						content:
							"You are an e-commerce expert specializing in product listings and marketing content. Always provide all required fields in your response.",
					},
					{ role: "user", content: prompt },
				],
				response_format: { type: "json_object" },
			});

			const content = JSON.parse(
				completion.choices[0].message?.content || "{}",
			) as GeneratedContent;

			const requiredFields: (keyof GeneratedContent)[] = [
				"name",
				"description",
				"detailedDescription",
				"benefits",
				"features",
				"targetAudience",
				"categories",
				"tags",
			];

			content.categories = content.categories.filter((category) =>
				predefinedCategories.includes(category),
			);

			content.tags = Array.from(new Set(content.tags)).slice(0, 8);

			for (const field of requiredFields) {
				if (!content[field]) {
					throw new Error(`Missing required field: ${field}`);
				}
			}

			return {
				...content,
				benefits: content.benefits || [],
				features: content.features || [],
				categories: content.categories || [],
				tags: content.tags || [],
			};
		} catch (error) {
			logger.error("Error generating offer content:", error);
			throw new Error("Failed to generate offer content");
		}
	}

	static async deleteAnalysis(id: string): Promise<void> {
		try {
			// If you have a dedicated model for URL analysis, use it here
			await AffiliateOffer.findByIdAndDelete(id);

			// If you're just storing temporary data, you might want to clear cache or temporary storage

			// For now, we'll just return as success
			return;
		} catch (error) {
			logger.error("Error deleting analysis:", error);
			throw new Error("Failed to delete analysis");
		}
	}
}
