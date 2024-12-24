import schedule from "node-schedule";
import { SubscriberCleanupService } from "@features/subscriber/subscriber-cleanup.service";
import { logger } from "@config/logger";

export class SchedulerService {
  static initializeScheduledTasks() {
    schedule.scheduleJob("0 0 * * *", async () => {
      try {
        logger.info("Starting scheduled subscriber cleanup");
        await SubscriberCleanupService.performCleanup();
        logger.info("Completed scheduled subscriber cleanup");
      } catch (error) {
        logger.error("Error during scheduled cleanup:", error);
      }
    });

    schedule.scheduleJob("0 */6 * * *", async () => {
      try {
        logger.info("Starting scheduled engagement score update");
        await SubscriberCleanupService.updateEngagementScores();
        logger.info("Completed scheduled engagement score update");
      } catch (error) {
        logger.error("Error during engagement score update:", error);
      }
    });
  }
}
