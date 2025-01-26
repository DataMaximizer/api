import OpenAI from "openai";
import axios from "axios";
import { load } from "cheerio";
import {
	AffiliateOffer,
	IAffiliateOffer,
	OfferStatus,
} from "@features/affiliate/models/affiliate-offer.model";
import { logger } from "@config/logger";

import {
	PREDEFINED_CATEGORIES,
	CATEGORY_HIERARCHY,
} from "@features/shared/constants/categories";

import { OPENAI_API_KEY } from "@/local";

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
    2. Short Marketing Description in HTML (max 200 chars)
    3. Detailed Description in HTML (comprehensive but concise)
    4. 3-5 Key Benefits (as HTML list)
    5. 3-5 Main Features (as HTML list)
    6. Target Audience Description in HTML
    7. Categories and Tags (as before)

    Use proper HTML formatting with these tags: <p>, <strong>, <em>, <ul>, <li>
  `;

		try {
			const completion = await openai.chat.completions.create({
				model: "gpt-4-turbo",
				messages: [
					{
						role: "system",
						content: `You are an e-commerce expert specializing in product listings and marketing content.
          Return HTML-formatted content for descriptions and lists.
          Always wrap paragraphs in <p> tags.
          Use <strong> for important points.
          Format lists with <ul> and <li> tags.`,
					},
					{ role: "user", content: prompt },
				],
				response_format: { type: "json_object" },
			});

			const content = JSON.parse(
				completion.choices[0].message?.content || "{}",
			) as GeneratedContent;

			// Ensure HTML formatting for text fields
			if (!content.description.includes("<p>")) {
				content.description = `<p>${content.description}</p>`;
			}
			if (!content.detailedDescription.includes("<p>")) {
				content.detailedDescription = `<p>${content.detailedDescription}</p>`;
			}
			if (!content.targetAudience.includes("<p>")) {
				content.targetAudience = `<p>${content.targetAudience}</p>`;
			}

			// Format benefits and features as HTML lists if they aren't already
			if (!content.benefits[0]?.includes("<li>")) {
				content.benefits = content.benefits.map(
					(benefit) => `<li>${benefit}</li>`,
				);
				content.benefits = [`<ul>${content.benefits.join("")}</ul>`];
			}
			if (!content.features[0]?.includes("<li>")) {
				content.features = content.features.map(
					(feature) => `<li>${feature}</li>`,
				);
				content.features = [`<ul>${content.features.join("")}</ul>`];
			}

			return content;
		} catch (error) {
			logger.error("Error generating offer content:", error);
			throw new Error("Failed to generate offer content");
		}
	}

	static async deleteAnalysis(id: string): Promise<void> {
		try {
			await AffiliateOffer.findByIdAndDelete(id);

			return;
		} catch (error) {
			logger.error("Error deleting analysis:", error);
			throw new Error("Failed to delete analysis");
		}
	}
}
