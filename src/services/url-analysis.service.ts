import OpenAI from "openai";
import axios from "axios";
import { load } from "cheerio";
import { IAffiliateOffer, OfferStatus } from "../models/affiliate-offer.model"; // Removed IProductInfo
import { logger } from "../config/logger";

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
	apiKey: process.env.OPENAI_API_KEY,
});

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
      7. 2-3 Category Suggestions
      8. 3-5 Relevant Tags

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
				model: "gpt-3.5-turbo",
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
				// @ts-ignore
				completion.choices[0].message.content,
			) as GeneratedContent;

			// Validate required fields
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
}
