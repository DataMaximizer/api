import { Campaign } from "@features/campaign/models/campaign.model";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import {
  IAffiliateOffer,
  AffiliateOffer,
  OfferStatus,
} from "@features/affiliate/models/affiliate-offer.model";
import { Types } from "mongoose";

/**
 * Represents campaign metrics.
 */
export interface ICampaignMetrics {
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  earningsPerClick: number;
  clickThroughRate: number;
  conversionRate: number;
}

/**
 * Represents an offer along with its earnings per click.
 */
export interface ITopOfferEPC {
  offer: IAffiliateOffer;
  earningsPerClick: number;
}

/**
 * Represents an offer along with its click-through rate.
 */
export interface ITopOfferCTR {
  offer: IAffiliateOffer;
  clickThroughRate: number;
}

/**
 * Represents an offer along with its conversion rate.
 */
export interface ITopOfferConversionRate {
  offer: IAffiliateOffer;
  conversionRate: number;
}

export class ConversionAnalysisAgent {
  /**
   * Aggregates metrics from all campaigns associated with a given offer.
   * @param offerId - The ID of the offer.
   * @returns An object with totalSent, totalOpens, totalClicks, totalConversions, totalRevenue,
   *          earningsPerClick, clickThroughRate, and conversionRate.
   */
  public async getMetricsByOffer(offerId: string): Promise<ICampaignMetrics> {
    const campaigns = await Campaign.find({ offerId });
    const aggregatedMetrics: ICampaignMetrics = {
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalRevenue: 0,
      earningsPerClick: 0,
      clickThroughRate: 0,
      conversionRate: 0,
    };

    campaigns.forEach((campaign) => {
      if (campaign.metrics) {
        aggregatedMetrics.totalSent += campaign.metrics.totalSent || 0;
        aggregatedMetrics.totalOpens += campaign.metrics.totalOpens || 0;
        aggregatedMetrics.totalClicks += campaign.metrics.totalClicks || 0;
        aggregatedMetrics.totalConversions +=
          campaign.metrics.totalConversions || 0;
        aggregatedMetrics.totalRevenue += campaign.metrics.totalRevenue || 0;
      }
    });

    aggregatedMetrics.earningsPerClick =
      aggregatedMetrics.totalClicks > 0
        ? aggregatedMetrics.totalRevenue / aggregatedMetrics.totalClicks
        : 0;

    aggregatedMetrics.clickThroughRate =
      aggregatedMetrics.totalSent > 0
        ? aggregatedMetrics.totalClicks / aggregatedMetrics.totalSent
        : 0;

    aggregatedMetrics.conversionRate =
      aggregatedMetrics.totalClicks > 0
        ? aggregatedMetrics.totalConversions / aggregatedMetrics.totalClicks
        : 0;

    return aggregatedMetrics;
  }

  /**
   * Retrieves the metrics for a given campaign.
   * @param campaignId - The ID of the campaign.
   * @returns The campaign's metrics including earningsPerClick, clickThroughRate, and conversionRate.
   * @throws Error if the campaign is not found.
   */
  public async getMetricsByCampaign(
    campaignId: string
  ): Promise<ICampaignMetrics> {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }
    const metrics = campaign.metrics || {
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalRevenue: 0,
    };
    const returnMetrics: ICampaignMetrics = {
      totalSent: metrics.totalSent,
      totalOpens: metrics.totalOpens,
      totalClicks: metrics.totalClicks,
      totalConversions: metrics.totalConversions,
      totalRevenue: metrics.totalRevenue,
      earningsPerClick:
        metrics.totalClicks > 0
          ? metrics.totalRevenue / metrics.totalClicks
          : 0,
      clickThroughRate:
        metrics.totalSent > 0 ? metrics.totalClicks / metrics.totalSent : 0,
      conversionRate:
        metrics.totalClicks > 0
          ? metrics.totalConversions / metrics.totalClicks
          : 0,
    };
    return returnMetrics;
  }

  /**
   * Retrieves the metrics for a given subscriber.
   * @param subscriberId - The ID of the subscriber.
   * @returns The subscriber's metrics.
   * @throws Error if the subscriber is not found.
   */
  public async getMetricsBySubscriber(subscriberId: string): Promise<{
    opens: number;
    clicks: number;
    conversions: number;
    bounces: number;
    revenue: number;
    interactions: any[];
  }> {
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      throw new Error("Subscriber not found");
    }
    return subscriber.metrics;
  }

  /**
   * Returns the top N active offers with the highest earnings per click.
   * This aggregates campaign metrics for each offer and sorts by earnings per click.
   * @param numOffers - The number of offers to return.
   * @returns A list of offers along with their earnings per click.
   */
  public async getTopOffersByEPC(numOffers: number): Promise<ITopOfferEPC[]> {
    // Retrieve all active offers.
    const offers: IAffiliateOffer[] = await AffiliateOffer.find({
      status: OfferStatus.ACTIVE,
    });
    // For each offer, get the aggregated metrics.
    const offersWithEPC = await Promise.all(
      offers.map(async (offer) => {
        const metrics = await this.getMetricsByOffer(
          (offer._id as Types.ObjectId).toString()
        );
        return {
          offer,
          earningsPerClick: metrics.earningsPerClick,
        };
      })
    );
    // Sort offers by earningsPerClick in descending order.
    offersWithEPC.sort((a, b) => b.earningsPerClick - a.earningsPerClick);
    return offersWithEPC.slice(0, numOffers);
  }

  /**
   * Returns the top N active offers with the highest click-through rate.
   * This aggregates campaign metrics for each offer and sorts by click-through rate.
   * @param numOffers - The number of offers to return.
   * @returns A list of offers along with their click-through rate.
   */
  public async getTopOffersByCTR(numOffers: number): Promise<ITopOfferCTR[]> {
    // Retrieve all active offers.
    const offers: IAffiliateOffer[] = await AffiliateOffer.find({
      status: OfferStatus.ACTIVE,
    });
    // For each offer, get the aggregated metrics.
    const offersWithCTR = await Promise.all(
      offers.map(async (offer) => {
        const metrics = await this.getMetricsByOffer(
          (offer._id as Types.ObjectId).toString()
        );
        return {
          offer,
          clickThroughRate: metrics.clickThroughRate,
        };
      })
    );
    // Sort offers by clickThroughRate in descending order.
    offersWithCTR.sort((a, b) => b.clickThroughRate - a.clickThroughRate);
    return offersWithCTR.slice(0, numOffers);
  }

  /**
   * Returns the top N active offers with the highest conversion rate.
   * This aggregates campaign metrics for each offer and sorts by conversion rate.
   * @param numOffers - The number of offers to return.
   * @returns A list of offers along with their conversion rate.
   */
  public async getTopOffersByConversionRate(
    numOffers: number
  ): Promise<ITopOfferConversionRate[]> {
    // Retrieve all active offers.
    const offers: IAffiliateOffer[] = await AffiliateOffer.find({
      status: OfferStatus.ACTIVE,
    });
    // For each offer, get the aggregated metrics and extract conversion rate.
    const offersWithConversionRate = await Promise.all(
      offers.map(async (offer) => {
        const metrics = await this.getMetricsByOffer(
          (offer._id as Types.ObjectId).toString()
        );
        return {
          offer,
          conversionRate: metrics.conversionRate,
        };
      })
    );
    // Sort offers by conversionRate in descending order.
    offersWithConversionRate.sort(
      (a, b) => b.conversionRate - a.conversionRate
    );
    return offersWithConversionRate.slice(0, numOffers);
  }
}
