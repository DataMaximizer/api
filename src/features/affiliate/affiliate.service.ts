import axios from "axios";
import OpenAI from "openai";
import { FilterQuery, QueryOptions } from "mongoose";
import {
  AffiliateOffer,
  OfferStatus,
  IAffiliateOffer,
} from "./models/affiliate-offer.model";
import { logger } from "@config/logger";
import { load } from "cheerio";
import { OfferEnhancementService } from "@features/shared/services/offer-enhancement.service";
import { CacheService } from "@core/services/cache.service";
import { Click } from "../tracking/models/click.model";
import mongoose from "mongoose";
import { Campaign } from "../campaign/models/campaign.model";
import {
  Commission,
  CommissionRule,
} from "../comission/models/commission.model";
import { LinkValidation } from "../url-analysis/models/link-validation.model";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export class AffiliateService {
  private static CACHE_TTL = 3600; // 1 hour
  private static CACHE_PREFIX = "affiliate:offers";

  static async createOffer(
    offerData: Partial<IAffiliateOffer>,
    manual: boolean = false
  ) {
    let enhancedOfferData;
    if (manual) {
      enhancedOfferData = offerData;
    } else {
      enhancedOfferData = await OfferEnhancementService.enhanceOfferDescription(
        offerData
      );
    }

    const offer = new AffiliateOffer(enhancedOfferData);

    offer.categories = OfferEnhancementService.validateCategories(
      offer.categories
    );

    if (offer.tags && offer.tags.length > 3) {
      offer.tags = offer.tags.slice(0, 3);
    }

    if (offerData.parameters) {
      offer.parameters = offerData.parameters.map((param) => ({
        type: param.type,
        name: param.name,
        placeholder: param.placeholder,
      }));
    } else {
      offer.parameters = [];
    }

    if (offer.url) {
      const click = await Click.create({
        subscriberId: offer.userId,
        campaignId: offer._id,
        linkId: offer._id as string,
        timestamp: new Date(),
      });

      if (!offer.url.includes("{clickId}")) {
        const urlObj = new URL(offer.url);
        urlObj.searchParams.append("clickId", click._id as string);
        offer.url = urlObj.toString();
      } else {
        offer.url = offer.url.replace("{clickId}", click._id as string);
      }
    }

    if (!manual) await this.scanAndEnrichOffer(offer);
    await offer.save();
    // Clear all offer-related caches
    await CacheService.del(`${this.CACHE_PREFIX}:*`);
    return offer;
  }

  static async scanAndEnrichOffer(offer: IAffiliateOffer) {
    try {
      const isAlive = await this.checkUrlStatus(offer.url);
      if (!isAlive) {
        offer.status = OfferStatus.PAUSED;
        return;
      }

      const pageContent = await this.scrapeWebpage(offer.url);

      const productInfo = await this.gatherProductInfo(
        pageContent,
        offer.description
      );
      offer.productInfo = productInfo;

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

      $("script").remove();
      $("style").remove();

      const title = $("title").text();
      const description = $('meta[name="description"]').attr("content") || "";
      const mainContent = $(
        "main, article, .product-description, #product-description"
      ).text();
      const price = $('.price, .product-price, [class*="price"]')
        .first()
        .text();

      return `
        Title: ${title.trim()}
        Description: ${description.trim()}
        Price: ${price.trim()}
        Content: ${mainContent.trim()}
      `.substring(0, 3000);
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
    productInfo: Record<string, any>
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

    if (updateData.parameters) {
      updateData.parameters = updateData.parameters.map((param) => ({
        type: param.type,
        name: param.name,
        placeholder: param.placeholder,
      }));
    }

    if (updateData.url && updateData.url !== offer.url) {
      offer.url = updateData.url;
    }

    Object.assign(offer, updateData);
    await Promise.all([
      CacheService.del(`${this.CACHE_PREFIX}:*`),
      CacheService.del(`${this.CACHE_PREFIX}:single:${JSON.stringify({ id })}`),
    ]);
    return offer.save();
  }

  static async getOffers(
    filters: FilterQuery<IAffiliateOffer> = {},
    options: QueryOptions = {}
  ) {
    try {
      console.log("📥 Getting offers with filters:", JSON.stringify(filters));
      console.log("⚙️ Query options:", JSON.stringify(options));

      const offers = await AffiliateOffer.find(filters, null, options)
        .populate("networkId", "name")
        .exec();
      console.log(`📝 Found ${offers.length} offers in database`);

      return offers;
    } catch (error) {
      logger.error("Error in getOffers:", error);
      console.error("❌ Error getting offers:", error);
      throw error;
    }
  }

  static async getOfferById(id: string) {
    try {
      console.log("🔍 Getting offer by ID:", id);

      const cacheKey = CacheService.generateKey(`${this.CACHE_PREFIX}:single`, {
        id,
      });
      const cachedOffer = await CacheService.get<IAffiliateOffer>(cacheKey);

      if (cachedOffer) {
        console.log("✅ Retrieved offer from cache:", cachedOffer._id);
        logger.debug("Returning cached offer");
        return cachedOffer;
      }

      console.log("🔄 Cache miss - fetching from database");
      const offer = await AffiliateOffer.findById(id);

      if (offer) {
        console.log("📝 Found offer in database:", offer._id);
        await CacheService.set(cacheKey, offer, this.CACHE_TTL);
      } else {
        console.log("⚠️ No offer found with ID:", id);
      }

      return offer;
    } catch (error) {
      logger.error("Error in getOfferById:", error);
      console.error("❌ Error getting offer by ID:", error);
      throw error;
    }
  }

  static async deleteOffer(id: string, userId: string) {
    try {
      // First check if the offer exists and belongs to the user
      const offer = await AffiliateOffer.findOne({
        _id: id,
        userId: userId,
      });

      if (!offer) {
        return { success: false, error: "Offer not found or unauthorized" };
      }

      // Check for related data
      const [
        campaignsCount,
        clicksCount,
        commissionsCount,
        commissionRulesCount,
        linkValidationsCount,
      ] = await Promise.all([
        Campaign.countDocuments({ offerId: id }),
        Click.countDocuments({
          campaignId: {
            $in: await Campaign.find({ offerId: id }).distinct("_id"),
          },
        }),
        Commission.countDocuments({ offerId: id }),
        CommissionRule.countDocuments({ offerId: id }),
        LinkValidation.countDocuments({ offerId: id }),
      ]);

      // If any related data exists, block the deletion
      if (
        campaignsCount > 0 ||
        clicksCount > 0 ||
        commissionsCount > 0 ||
        commissionRulesCount > 0 ||
        linkValidationsCount > 0
      ) {
        return {
          success: false,
          error: "Cannot delete offer with existing relationships",
          relationships: {
            campaigns: campaignsCount,
            clicks: clicksCount,
            commissions: commissionsCount,
            commissionRules: commissionRulesCount,
            linkValidations: linkValidationsCount,
          },
        };
      }

      // If no relationships exist, proceed with deletion
      await AffiliateOffer.deleteOne({ _id: id });

      // Clear cache
      await Promise.all([
        CacheService.del(`${this.CACHE_PREFIX}:*`),
        CacheService.del(
          `${this.CACHE_PREFIX}:single:${JSON.stringify({ id })}`
        ),
      ]);

      return { success: true };
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
