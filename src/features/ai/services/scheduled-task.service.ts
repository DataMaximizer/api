import {
  OptimizationRound,
  OptimizationStatus,
} from "../models/optimization-round.model";
import {
  EmailOptimizationOrchestrator,
  IOptimizationConfig,
} from "../agents/orchestrator/EmailOptimizationOrchestrator";
import { CampaignProcess } from "../models/campaign-process.model";
import { Types } from "mongoose";

/**
 * Service to handle scheduled tasks that need to persist through server restarts
 */
export class ScheduledTaskService {
  private static instance: ScheduledTaskService;
  private checkInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private orchestrator: EmailOptimizationOrchestrator;

  private constructor() {
    this.orchestrator = new EmailOptimizationOrchestrator();
  }

  /**
   * Get the singleton instance of the service
   */
  public static getInstance(): ScheduledTaskService {
    if (!ScheduledTaskService.instance) {
      ScheduledTaskService.instance = new ScheduledTaskService();
    }
    return ScheduledTaskService.instance;
  }

  /**
   * Initialize the scheduled task service
   * Start checking for pending optimization rounds
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    console.log("Initializing ScheduledTaskService...");

    // Check for pending tasks every minute
    this.checkInterval = setInterval(() => {
      this.checkPendingTasks().catch((err) => {
        console.error("Error checking pending tasks:", err);
      });
    }, 60 * 1000); // Check every minute

    // Run an initial check immediately
    this.checkPendingTasks().catch((err) => {
      console.error("Error during initial check of pending tasks:", err);
    });

    this.isInitialized = true;
  }

  /**
   * Stop the scheduled task service
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isInitialized = false;
  }

  /**
   * Check for all types of pending tasks that need to be processed
   */
  private async checkPendingTasks(): Promise<void> {
    await this.checkPendingOptimizationRounds();
    await this.checkRoundsReadyForAnalysis();
  }

  /**
   * Check for pending optimization rounds that need to be processed
   */
  private async checkPendingOptimizationRounds(): Promise<void> {
    const now = new Date();

    // Find pending rounds that are scheduled to start before or at the current time
    const pendingRounds = await OptimizationRound.find({
      status: OptimizationStatus.PENDING,
      startDate: { $lte: now },
    }).sort({ startDate: 1 });

    if (pendingRounds.length > 0) {
      console.log(
        `Found ${pendingRounds.length} pending optimization rounds to process`
      );
    }

    // Process each pending round
    for (const round of pendingRounds) {
      try {
        // Get the campaign process to retrieve configuration
        const process = await CampaignProcess.findById(round.campaignProcessId);
        if (!process) {
          console.error(`Campaign process not found for round ${round.id}`);
          continue;
        }

        // Retrieve the last used configuration for this process
        const config = await this.getConfigurationForProcess(
          process.id.toString()
        );
        if (!config) {
          console.error(
            `Configuration not found for process ${process.id.toString()}`
          );
          continue;
        }

        console.log(
          `Starting round ${
            round.roundNumber
          } for process ${process.id.toString()}`
        );

        // Update round status to in_progress
        await OptimizationRound.findByIdAndUpdate(round._id, {
          status: OptimizationStatus.IN_PROGRESS,
        });

        // Process the round without awaiting (allowing the processing to happen in the background)
        this.orchestrator
          .processRound(round.id.toString(), config)
          .catch((err) => {
            console.error(
              `Error processing round ${round.id.toString()}:`,
              err
            );
          });
      } catch (error) {
        console.error(
          `Error processing pending round ${round.id.toString()}:`,
          error
        );
      }
    }
  }

  /**
   * Check for rounds that are waiting for metrics and ready for analysis
   */
  private async checkRoundsReadyForAnalysis(): Promise<void> {
    const now = new Date();

    // Find rounds that are waiting for metrics and past their scheduled analysis time
    const roundsReadyForAnalysis = await OptimizationRound.find({
      status: OptimizationStatus.WAITING_FOR_METRICS,
      metricsAnalysisTime: { $lte: now },
    }).sort({ metricsAnalysisTime: 1 });

    if (roundsReadyForAnalysis.length > 0) {
      console.log(
        `Found ${roundsReadyForAnalysis.length} rounds ready for metrics analysis`
      );
    }

    // Process each round ready for analysis
    for (const round of roundsReadyForAnalysis) {
      try {
        // Get the campaign process to retrieve configuration
        const process = await CampaignProcess.findById(round.campaignProcessId);
        if (!process) {
          console.error(`Campaign process not found for round ${round.id}`);
          continue;
        }

        // Retrieve the configuration for this process
        const config = await this.getConfigurationForProcess(
          process.id.toString()
        );
        if (!config) {
          console.error(
            `Configuration not found for process ${process.id.toString()}`
          );
          continue;
        }

        console.log(
          `Starting metrics analysis for round ${
            round.roundNumber
          } of process ${process.id.toString()}`
        );

        // Analyze the round results
        this.orchestrator
          .analyzeRoundResults(round.id.toString(), config)
          .catch((err) => {
            console.error(`Error analyzing round ${round.id.toString()}:`, err);
          });
      } catch (error) {
        console.error(
          `Error processing analysis for round ${round.id.toString()}:`,
          error
        );
      }
    }
  }

  /**
   * Retrieve the configuration for a campaign process
   */
  private async getConfigurationForProcess(
    processId: string
  ): Promise<IOptimizationConfig | null> {
    try {
      // Retrieve the process
      const process = await CampaignProcess.findById(
        new Types.ObjectId(processId)
      );

      if (!process || !process.configuration) {
        console.error(`Process or configuration not found for ID ${processId}`);
        return null;
      }

      return process.configuration as IOptimizationConfig;
    } catch (error) {
      console.error(
        `Error retrieving configuration for process ${processId}:`,
        error
      );
      return null;
    }
  }
}

// Export singleton instance
export const scheduledTaskService = ScheduledTaskService.getInstance();
