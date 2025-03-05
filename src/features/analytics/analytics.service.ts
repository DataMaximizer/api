import { logger } from "@config/logger";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { Types } from "mongoose";

interface MonthlyRevenue {
  month: string;
  revenue: number;
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
}
