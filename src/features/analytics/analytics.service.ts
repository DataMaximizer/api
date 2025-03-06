import { logger } from "@config/logger";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { Types } from "mongoose";

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface MonthlyClicks {
  month: string;
  clicks: number;
}

interface MonthlyConversions {
  month: string;
  conversions: number;
}

interface MonthlyBounces {
  month: string;
  bounces: number;
}

interface MonthlySubscribers {
  month: string;
  subscribers: number;
  unsubscribers: number;
}

export class AnalyticsService {
  /**
   * Get revenue data grouped by month
   * @param userId The ID of the current user
   * @returns Revenue data grouped by month
   */
  static async getRevenue(userId: string) {
    try {
      // Find all subscribers for the current user
      const subscribers = await Subscriber.find({
        userId: new Types.ObjectId(userId),
      });

      // Initialize monthly revenue object
      const monthlyRevenue: Record<string, number> = {};

      // Process each subscriber
      subscribers.forEach((subscriber) => {
        // Get all conversion interactions with amount
        const conversions =
          subscriber.metrics.interactions?.filter(
            (interaction) =>
              interaction.type === "conversion" &&
              interaction.amount !== undefined
          ) || [];

        // Group by month
        conversions.forEach((conversion) => {
          const date = new Date(conversion.timestamp);
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;

          // Add to monthly revenue
          if (!monthlyRevenue[monthKey]) {
            monthlyRevenue[monthKey] = 0;
          }

          monthlyRevenue[monthKey] += conversion.amount || 0;
        });
      });

      // Convert to array format for response
      const result: MonthlyRevenue[] = Object.entries(monthlyRevenue).map(
        ([month, revenue]) => ({
          month,
          revenue,
        })
      );

      // Sort by month (newest first)
      result.sort((a, b) => b.month.localeCompare(a.month));

      return result;
    } catch (error) {
      logger.error("Error getting revenue:", error);
      throw error;
    }
  }

  /**
   * Get clicks data grouped by month
   * @param userId The ID of the current user
   * @returns Clicks data grouped by month
   */
  static async getClicks(userId: string) {
    try {
      // Find all subscribers for the current user
      const subscribers = await Subscriber.find({
        userId: new Types.ObjectId(userId),
      });

      // Initialize monthly clicks object
      const monthlyClicks: Record<string, number> = {};

      // Process each subscriber
      subscribers.forEach((subscriber) => {
        // Get all click interactions
        const clicks =
          subscriber.metrics.interactions?.filter(
            (interaction) => interaction.type === "click"
          ) || [];

        // Group by month
        clicks.forEach((click) => {
          const date = new Date(click.timestamp);
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;

          // Add to monthly clicks
          if (!monthlyClicks[monthKey]) {
            monthlyClicks[monthKey] = 0;
          }

          monthlyClicks[monthKey] += 1;
        });
      });

      // Convert to array format for response
      const result: MonthlyClicks[] = Object.entries(monthlyClicks).map(
        ([month, clicks]) => ({
          month,
          clicks,
        })
      );

      // Sort by month (newest first)
      result.sort((a, b) => b.month.localeCompare(a.month));

      return result;
    } catch (error) {
      logger.error("Error getting clicks:", error);
      throw error;
    }
  }

  /**
   * Get conversions data grouped by month
   * @param userId The ID of the current user
   * @returns Conversions data grouped by month
   */
  static async getConversions(userId: string) {
    try {
      // Find all subscribers for the current user
      const subscribers = await Subscriber.find({
        userId: new Types.ObjectId(userId),
      });

      // Initialize monthly conversions object
      const monthlyConversions: Record<string, number> = {};

      // Process each subscriber
      subscribers.forEach((subscriber) => {
        // Get all conversion interactions
        const conversions =
          subscriber.metrics.interactions?.filter(
            (interaction) => interaction.type === "conversion"
          ) || [];

        // Group by month
        conversions.forEach((conversion) => {
          const date = new Date(conversion.timestamp);
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;

          // Add to monthly conversions
          if (!monthlyConversions[monthKey]) {
            monthlyConversions[monthKey] = 0;
          }

          monthlyConversions[monthKey] += 1;
        });
      });

      // Convert to array format for response
      const result: MonthlyConversions[] = Object.entries(
        monthlyConversions
      ).map(([month, conversions]) => ({
        month,
        conversions,
      }));

      // Sort by month (newest first)
      result.sort((a, b) => b.month.localeCompare(a.month));

      return result;
    } catch (error) {
      logger.error("Error getting conversions:", error);
      throw error;
    }
  }

  /**
   * Get bounces data grouped by month
   * @param userId The ID of the current user
   * @returns Bounces data grouped by month
   */
  static async getBounces(userId: string) {
    try {
      // Find all subscribers for the current user
      const subscribers = await Subscriber.find({
        userId: new Types.ObjectId(userId),
      });

      // Initialize monthly bounces object
      const monthlyBounces: Record<string, number> = {};

      // Process each subscriber
      subscribers.forEach((subscriber) => {
        // Get all bounce interactions
        const bounces =
          subscriber.metrics.interactions?.filter(
            (interaction) => interaction.type === "bounce"
          ) || [];

        // Group by month
        bounces.forEach((bounce) => {
          const date = new Date(bounce.timestamp);
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;

          // Add to monthly bounces
          if (!monthlyBounces[monthKey]) {
            monthlyBounces[monthKey] = 0;
          }

          monthlyBounces[monthKey] += 1;
        });
      });

      // Convert to array format for response
      const result: MonthlyBounces[] = Object.entries(monthlyBounces).map(
        ([month, bounces]) => ({
          month,
          bounces,
        })
      );

      // Sort by month (newest first)
      result.sort((a, b) => b.month.localeCompare(a.month));

      return result;
    } catch (error) {
      logger.error("Error getting bounces:", error);
      throw error;
    }
  }

  /**
   * Get subscriber and unsubscriber counts grouped by month
   * @param userId The ID of the current user
   * @returns Subscriber and unsubscriber data grouped by month
   */
  static async getSubscriberAnalytics(userId: string) {
    try {
      // Find all subscribers for the current user
      const subscribers = await Subscriber.find({
        userId: new Types.ObjectId(userId),
      });

      // Initialize monthly subscriber objects
      const monthlySubscribers: Record<
        string,
        { subscribers: number; unsubscribers: number }
      > = {};

      // Process each subscriber
      subscribers.forEach((subscriber) => {
        // Get creation date for new subscribers
        const createdAt = new Date(subscriber.createdAt);
        const createdMonthKey = `${createdAt.getFullYear()}-${String(
          createdAt.getMonth() + 1
        ).padStart(2, "0")}`;

        // Initialize month if it doesn't exist
        if (!monthlySubscribers[createdMonthKey]) {
          monthlySubscribers[createdMonthKey] = {
            subscribers: 0,
            unsubscribers: 0,
          };
        }

        // Increment subscriber count for the month
        monthlySubscribers[createdMonthKey].subscribers += 1;

        // Check for unsubscribes
        if (
          subscriber.status === "unsubscribed" &&
          subscriber.metadata &&
          "unsubscribeDate" in subscriber.metadata
        ) {
          const unsubscribeDate = new Date(
            subscriber.metadata.unsubscribeDate as Date
          );
          const unsubscribeMonthKey = `${unsubscribeDate.getFullYear()}-${String(
            unsubscribeDate.getMonth() + 1
          ).padStart(2, "0")}`;

          // Initialize month if it doesn't exist
          if (!monthlySubscribers[unsubscribeMonthKey]) {
            monthlySubscribers[unsubscribeMonthKey] = {
              subscribers: 0,
              unsubscribers: 0,
            };
          }

          // Increment unsubscriber count for the month
          monthlySubscribers[unsubscribeMonthKey].unsubscribers += 1;
        }
      });

      // Convert to array format for response
      const result: MonthlySubscribers[] = Object.entries(
        monthlySubscribers
      ).map(([month, data]) => ({
        month,
        subscribers: data.subscribers,
        unsubscribers: data.unsubscribers,
      }));

      // Sort by month (newest first)
      result.sort((a, b) => b.month.localeCompare(a.month));

      return result;
    } catch (error) {
      logger.error("Error getting subscriber analytics:", error);
      throw error;
    }
  }
}
