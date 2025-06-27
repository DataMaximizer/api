import axios from "axios";
import { FilterQuery, QueryOptions, Types } from "mongoose";
import {
  AffiliateOffer,
  OfferStatus,
  IAffiliateOffer,
} from "./models/affiliate-offer.model";
import { logger } from "@config/logger";
import { load } from "cheerio";
import { OfferEnhancementService } from "@features/shared/services/offer-enhancement.service";
import { CacheService } from "@core/services/cache.service";
import { Campaign } from "../campaign/models/campaign.model";
import {
  Commission,
  CommissionRule,
} from "../comission/models/commission.model";
import { LinkValidation } from "../url-analysis/models/link-validation.model";
import { PREDEFINED_CATEGORIES } from "../shared/constants/categories";
import { GeneratedContent } from "../url-analysis/url-analysis.service";
import { aiService } from "../ai/services/ai.service";
import { Subscriber } from "../subscriber/models/subscriber.model";
import { FallbackAiProvider } from "../ai/providers/fallback.provider";
import { Click } from "../tracking/models/click.model";

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
      try {
        if (!offer.url.includes("{clickId}")) {
          const urlObj = new URL(offer.url);
          urlObj.searchParams.set("clickId", "{clickId}");
          offer.url = urlObj.toString();
        }
      } catch (error) {
        logger.error("Error parsing or modifying offer URL:", error);
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

      const aiclient = new FallbackAiProvider({});
      const result: { content: string } =
        await aiclient.generateSystemPromptContent(
          "You are a product analysis expert. Provide concise, accurate information focused on key selling points and target audience.",
          prompt
        );
      const sections = result.content.split("\n\n");
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

      const aiclient = new FallbackAiProvider({});
      const completion: { content: string } =
        await aiclient.generateSystemPromptContent(
          "You are a product tagging expert. Return only the requested tags, nothing else.",
          prompt
        );
      const tags = completion.content.split(",") || [];

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
    if (updateData.parameters) {
      updateData.parameters = updateData.parameters.map((param) => ({
        type: param.type,
        name: param.name,
        placeholder: param.placeholder,
      }));
    }

    const offer = await AffiliateOffer.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!offer) {
      throw new Error("Offer not found");
    }

    await Promise.all([
      CacheService.del(`${this.CACHE_PREFIX}:*`),
      CacheService.del(`${this.CACHE_PREFIX}:single:${JSON.stringify({ id })}`),
    ]);

    return offer;
  }

  static async getOffers(
    filters: FilterQuery<IAffiliateOffer> = {},
    options: QueryOptions = {}
  ) {
    try {
      logger.info("📥 Getting offers with filters:", JSON.stringify(filters));
      logger.info("⚙️ Query options:", JSON.stringify(options));

      const offers = await AffiliateOffer.find(filters, null, options)
        .populate("networkId", "name")
        .exec();
      logger.info(`📝 Found ${offers.length} offers in database`);

      return offers;
    } catch (error) {
      logger.error("Error in getOffers:", error);
      throw error;
    }
  }

  static async getOfferById(id: string) {
    try {
      logger.info("🔍 Getting offer by ID:", id);

      const cacheKey = CacheService.generateKey(`${this.CACHE_PREFIX}:single`, {
        id,
      });
      const cachedOffer = await CacheService.get<IAffiliateOffer>(cacheKey);

      if (cachedOffer) {
        logger.info("✅ Retrieved offer from cache:", cachedOffer._id);
        logger.debug("Returning cached offer");
        return cachedOffer;
      }

      logger.info("🔄 Cache miss - fetching from database");
      const offer = await AffiliateOffer.findById(id);

      if (offer) {
        logger.info("📝 Found offer in database:", offer._id);
        await CacheService.set(cacheKey, offer, this.CACHE_TTL);
      } else {
        logger.info("⚠️ No offer found with ID:", id);
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

  async generateOfferFromImage(
    image: Buffer | string,
    aiProvider: "openai" | "claude" = "openai",
    openaiApiKey?: string,
    anthropicApiKey?: string
  ): Promise<Partial<IAffiliateOffer>> {
    let text: string;

    if (aiProvider === "openai") {
      if (!openaiApiKey) {
        throw new Error(
          "OpenAI API key is required for image text extraction with OpenAI provider."
        );
      }
      // Assuming aiService has an extractTextWithOpenAI method
      text = await aiService.extractTextWithOpenAI(image, openaiApiKey);
    } else {
      text = await aiService.extractTextWithClaude(image);
    }

    const generatedContent = await this.generateOfferFromText(
      text,
      aiProvider,
      openaiApiKey,
      anthropicApiKey
    );

    const offerData: Partial<IAffiliateOffer> = {
      name: generatedContent.name,
      description: generatedContent.description,
      categories: generatedContent.categories,
      tags: generatedContent.tags || [],
      productInfo: {
        description: generatedContent.detailedDescription,
        benefits: generatedContent.benefits,
        targetAudience: generatedContent.targetAudience,
        features: generatedContent.features,
      },
    };

    if (!offerData.name || !offerData.description) {
      throw new Error("Failed to generate required offer content");
    }

    return offerData;
  }

  /**
   * Processes text using AI (OpenAI or Claude)
   * @param text - The text to process
   * @param aiProvider - The AI provider to use ('openai' or 'claude')
   * @param openaiApiKey - OpenAI API key (required if aiProvider is 'openai')
   * @param anthropicApiKey - Anthropic API key (required if aiProvider is 'claude')
   * @returns Promise containing the AI-processed text
   */
  async generateOfferFromText(
    text: string,
    aiProvider: "openai" | "claude" = "openai",
    openaiApiKey?: string,
    anthropicApiKey?: string
  ): Promise<GeneratedContent> {
    if (aiProvider === "openai" && !openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }

    if (aiProvider === "claude" && !anthropicApiKey) {
      throw new Error("Anthropic API key is required");
    }

    // Placeholder prompt - to be replaced later
    const prompt = `
      The following is a text extracted from an image that is likely a product webpage.
      I need you to analyze this text and extract the product information.
      Keep in mind that the text might contain some noise or other unrelated products as recommendations, so you need to be careful.

      <text>
      ${text}
      </text>

      Create an e-commerce offer with the following (All fields are REQUIRED):

      1. Product Name (max 100 chars, catchy and descriptive)
      2. Short Marketing Description (max 200 chars)
      3. Detailed Description (comprehensive but concise)
      4. 3-5 Key Benefits (bullet points)
      5. 3-5 Main Features (bullet points)
      6. Target Audience Description
      7. 3-5 Most Relevant Categories from this list ONLY: ${PREDEFINED_CATEGORIES.join(
        ", "
      )}
      8. 5-8 Relevant Tags (short, 1-2 words each, highly relevant for search and categorization)

      Format response as JSON with these exact keys. Keep in mind that the JSON should be valid, as it will be parsed by a JSON parser:
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

    const aiclient = new FallbackAiProvider({});
    const response: { content: string } =
      await aiclient.generateSystemPromptContent(
        "You are an e-commerce expert specializing in product listings and marketing content. Always provide all required fields in your response. Respond with valid JSON only.",
        prompt,
        true
      );

    return JSON.parse(response.content) as GeneratedContent;
  }

  /**
   * Get offer reports with metrics for each offer.
   * Sums metrics (sent, opens, clicks, conversions, revenue, unsubscribes) for campaigns related to each offer.
   * @param userId - User ID to filter offers by
   * @returns Array of offer reports with metrics
   */
  static async getOfferReports(userId: string) {
    try {
      // Find all offers for the user
      const offers: IAffiliateOffer[] = await AffiliateOffer.find({
        userId,
      }).lean();

      if (!offers || offers.length === 0) {
        return [];
      }

      // Get all offer IDs
      const offerIds = offers.map((offer) => offer._id);

      // Find all campaigns related to these offers
      const campaigns = await Campaign.find({
        offerId: { $in: offerIds },
      }).lean();

      // Get all campaign IDs to query for unsubscribes
      const campaignIds = campaigns.map((campaign) => campaign._id);

      // Query subscribers who unsubscribed from these campaigns
      const unsubscribes = await Subscriber.aggregate([
        {
          $match: {
            "metadata.unsubscribeCampaignId": { $in: campaignIds },
            status: "unsubscribed",
          },
        },
        {
          $group: {
            _id: "$metadata.unsubscribeCampaignId",
            unsubscribeCount: { $sum: 1 },
          },
        },
      ]);

      // Map campaign IDs to unsubscribe counts
      const unsubscribeMap = new Map();
      for (const item of unsubscribes) {
        unsubscribeMap.set(item._id.toString(), item.unsubscribeCount);
      }

      // Create a map to group campaigns by offer ID and sum metrics
      const offerReportsMap = new Map();

      // Initialize offer reports map with all offers
      for (const offer of offers) {
        const offerId = offer._id.toString();
        offerReportsMap.set(offerId, {
          id: offerId,
          name: offer.name,
          description: offer.description,
          url: offer.url,
          status: offer.status,
          categories: offer.categories,
          tags: offer.tags,
          commissionRate: offer.commissionRate,
          createdAt: offer.createdAt,
          updatedAt: offer.updatedAt,
          campaignCount: 0,
          metrics: {
            totalSent: 0,
            totalOpens: 0,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            totalUnsubscribes: 0,
          },
        });
      }

      // Process each campaign and aggregate metrics by offer
      for (const campaign of campaigns) {
        const offerId = campaign.offerId?.toString();
        const campaignId = campaign._id.toString();

        if (!offerId || !offerReportsMap.has(offerId)) continue;

        const report = offerReportsMap.get(offerId);
        report.campaignCount += 1;

        // Get unsubscribe count for this campaign
        const unsubscribeCount = unsubscribeMap.get(campaignId) || 0;

        // Sum metrics if they exist
        if (campaign.metrics) {
          report.metrics.totalSent += campaign.metrics.totalSent || 0;
          report.metrics.totalOpens += campaign.metrics.totalOpens || 0;
          report.metrics.totalClicks += campaign.metrics.totalClicks || 0;
          report.metrics.totalConversions +=
            campaign.metrics.totalConversions || 0;
          report.metrics.totalRevenue += campaign.metrics.totalRevenue || 0;
        }

        // Add unsubscribe count to total metrics
        report.metrics.totalUnsubscribes += unsubscribeCount;
      }

      return Array.from(offerReportsMap.values());
    } catch (error) {
      logger.error("Error getting offer reports:", error);
      throw error;
    }
  }

  /**
   * Get offer analytics grouped by writing style, tone, framework, and personality
   * Calculates metrics to identify which copywriting approaches work best for each offer
   * @param userId - User ID to filter offers by
   * @param offerId - Optional offer ID to filter campaigns for a specific offer
   * @returns Analytics grouped by writing style, tone, framework, and personality
   */
  static async getOfferAnalytics(userId: string, offerId?: string) {
    try {
      // Find offers based on the query parameters
      const offerQuery: FilterQuery<IAffiliateOffer> = { userId };
      let offers: IAffiliateOffer[] = [];

      if (offerId) {
        offers = await AffiliateOffer.find({
          _id: offerId,
        }).lean();
      } else {
        offers = await AffiliateOffer.find(offerQuery).lean();
      }

      if (!offers || offers.length === 0) {
        return {
          byWritingStyle: [],
          byTone: [],
          byFramework: [],
          byPersonality: [],
        };
      }

      // Get all offer IDs
      const offerIds = offers.map((offer) => offer._id);

      // Find all campaigns related to these offers
      const campaignQuery: any = {};

      // If offerId is provided, filter directly by that ID
      if (offerId) {
        campaignQuery.offerId = offerId;
      } else {
        campaignQuery.offerId = { $in: offerIds };
      }

      const campaigns = await Campaign.find(campaignQuery).lean();

      if (campaigns.length === 0) {
        return {
          byWritingStyle: [],
          byTone: [],
          byFramework: [],
          byPersonality: [],
        };
      }

      // Create maps to track analytics
      const writingStyleAnalytics = new Map();
      const toneAnalytics = new Map();
      const frameworkAnalytics = new Map();
      const personalityAnalytics = new Map();

      // Process each campaign
      for (const campaign of campaigns) {
        if (!campaign.offerId) continue;

        // Extract metrics (default to 0 if not present)
        const clicks = campaign.metrics?.totalClicks || 0;
        const conversions = campaign.metrics?.totalConversions || 0;
        const revenue = campaign.metrics?.totalRevenue || 0;

        // Process writing style
        const writingStyle = campaign.writingStyle || "Unknown";
        if (!writingStyleAnalytics.has(writingStyle)) {
          writingStyleAnalytics.set(writingStyle, {
            writingStyle,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            campaignCount: 0,
          });
        }
        const styleStats = writingStyleAnalytics.get(writingStyle);
        styleStats.totalClicks += clicks;
        styleStats.totalConversions += conversions;
        styleStats.totalRevenue += revenue;
        styleStats.campaignCount += 1;

        // Process tone
        const tone = campaign.tone || "Unknown";
        if (!toneAnalytics.has(tone)) {
          toneAnalytics.set(tone, {
            tone,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            campaignCount: 0,
          });
        }
        const toneStats = toneAnalytics.get(tone);
        toneStats.totalClicks += clicks;
        toneStats.totalConversions += conversions;
        toneStats.totalRevenue += revenue;
        toneStats.campaignCount += 1;

        // Process framework
        const framework = campaign.framework || "Unknown";
        if (!frameworkAnalytics.has(framework)) {
          frameworkAnalytics.set(framework, {
            framework,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            campaignCount: 0,
          });
        }
        const frameworkStats = frameworkAnalytics.get(framework);
        frameworkStats.totalClicks += clicks;
        frameworkStats.totalConversions += conversions;
        frameworkStats.totalRevenue += revenue;
        frameworkStats.campaignCount += 1;

        // Process personality
        const personality = campaign.personality || "Unknown";
        if (!personalityAnalytics.has(personality)) {
          personalityAnalytics.set(personality, {
            personality,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            campaignCount: 0,
          });
        }
        const personalityStats = personalityAnalytics.get(personality);
        personalityStats.totalClicks += clicks;
        personalityStats.totalConversions += conversions;
        personalityStats.totalRevenue += revenue;
        personalityStats.campaignCount += 1;
      }

      // Helper function to process and sort analytics
      const processAnalytics = (
        analyticsMap: Map<
          string,
          {
            totalClicks: number;
            totalConversions: number;
            totalRevenue: number;
            campaignCount: number;
            [key: string]: any;
          }
        >
      ) => {
        return Array.from(analyticsMap.values()).sort((a, b) => {
          // First sort by conversions, then by clicks if conversions are equal
          if (b.totalConversions === a.totalConversions) {
            return b.totalClicks - a.totalClicks;
          }
          return b.totalConversions - a.totalConversions;
        });
      };

      // Return aggregated analytics
      return {
        byWritingStyle: processAnalytics(writingStyleAnalytics),
        byTone: processAnalytics(toneAnalytics),
        byFramework: processAnalytics(frameworkAnalytics),
        byPersonality: processAnalytics(personalityAnalytics),
      };
    } catch (error) {
      logger.error("Error getting offer analytics:", error);
      throw error;
    }
  }
}
