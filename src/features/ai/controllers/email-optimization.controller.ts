import { Request, Response } from "express";
import {
  EmailOptimizationOrchestrator,
  IOptimizationConfig,
} from "../agents/orchestrator/EmailOptimizationOrchestrator";
import { logger } from "@config/logger";
import { SegmentStatus } from "../models/subscriber-segment.model";
import { OptimizationStatus } from "../models/optimization-round.model";
import { CampaignProcess } from "../models/campaign-process.model";
import { OptimizationRound } from "../models/optimization-round.model";
import { SubscriberSegment } from "../models/subscriber-segment.model";
import { Types } from "mongoose";
import { EmailOptimizationService } from "../services/email-optimization.service";
import { Subscriber } from "@features/subscriber/models/subscriber.model";

export class EmailOptimizationController {
  /**
   * Starts a new email optimization process
   *
   * @param req - Express request object
   * @param res - Express response object
   */
  public static async startOptimizationProcess(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const {
        subscriberListId,
        offerIds,
        selectionPercentage,
        numberOfRounds,
        segmentationConfig,
        smtpProviderId,
        senderName,
        senderEmail,
        aiProvider,
        roundInterval,
        campaignName,
        waitTimeForMetrics,
      } = req.body;

      // Validate required fields
      if (
        !subscriberListId ||
        !offerIds ||
        !smtpProviderId ||
        !senderName ||
        !senderEmail
      ) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      // Validate offer IDs
      if (!Array.isArray(offerIds) || offerIds.length < 1) {
        res.status(400).json({ error: "At least 5 offers are required" });
        return;
      }

      // Default roundInterval value
      const defaultRoundInterval = 1440; // 24 hours in minutes
      const finalRoundInterval = roundInterval
        ? Number(roundInterval)
        : defaultRoundInterval;

      // Validate roundInterval is a positive number
      if (isNaN(finalRoundInterval) || finalRoundInterval <= 0) {
        res.status(400).json({
          error: "Invalid roundInterval",
          message: "roundInterval must be a positive number of minutes",
        });
        return;
      }

      // Validate and set waitTimeForMetrics
      const defaultWaitTime = 60; // Default to 1 hour in minutes
      let finalWaitTimeForMetrics = waitTimeForMetrics
        ? Number(waitTimeForMetrics)
        : defaultWaitTime;

      // Validate waitTimeForMetrics is a positive number
      if (isNaN(finalWaitTimeForMetrics) || finalWaitTimeForMetrics <= 0) {
        res.status(400).json({
          error: "Invalid waitTimeForMetrics",
          message: "waitTimeForMetrics must be a positive number of minutes",
        });
        return;
      }

      // Ensure waitTimeForMetrics is not greater than roundInterval
      if (finalWaitTimeForMetrics > finalRoundInterval) {
        res.status(400).json({
          error: "waitTimeForMetrics cannot be greater than roundInterval",
          message: `Wait time for metrics (${finalWaitTimeForMetrics} minutes) exceeds round interval (${finalRoundInterval} minutes)`,
        });
        return;
      }

      // Create configuration object
      const config: IOptimizationConfig = {
        userId,
        subscriberListId,
        offerIds,
        selectionPercentage: selectionPercentage || 0.2,
        numberOfRounds: numberOfRounds || 3,
        segmentationConfig: segmentationConfig || {
          numberOfSegments: 5,
          segmentSize: 20,
          includeControlGroup: false,
          controlGroupSize: 10,
          explorationRate: 0.3,
        },
        smtpProviderId,
        senderName,
        senderEmail,
        aiProvider: aiProvider || "openai",
        roundInterval: finalRoundInterval,
        campaignName:
          campaignName ||
          `Optimization Process - ${new Date().toLocaleDateString()}`,
        waitTimeForMetrics: finalWaitTimeForMetrics,
      };

      console.log("Optimization config", config);

      // Start the optimization process
      const orchestrator = new EmailOptimizationOrchestrator();
      const processId = await orchestrator.startOptimizationProcess(config);

      res.status(200).json({
        success: true,
        message: "Email optimization process started successfully",
        processId,
      });
    } catch (error) {
      logger.error("Error starting email optimization process:", error);
      res.status(500).json({
        error: "Failed to start email optimization process",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets the status of an email optimization process
   *
   * @param req - Express request object
   * @param res - Express response object
   */
  public static async getOptimizationStatus(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { processId } = req.params;
      if (!processId) {
        res.status(400).json({ error: "Process ID is required" });
        return;
      }

      // Check if the process belongs to the user
      const process = await CampaignProcess.findOne({
        _id: processId,
        userId,
      });

      if (!process) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      // Get process status
      const orchestrator = new EmailOptimizationOrchestrator();
      const status = await orchestrator.checkProcessStatus(processId);

      res.status(200).json({
        success: true,
        status,
      });
    } catch (error) {
      logger.error("Error getting optimization status:", error);
      res.status(500).json({
        error: "Failed to get optimization status",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Lists all email optimization processes for a user
   *
   * @param req - Express request object
   * @param res - Express response object
   */
  public static async listOptimizationProcesses(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Get all processes for the user
      const processes = await CampaignProcess.find({
        userId,
      }).sort({ createdAt: -1 });

      // Get process IDs to find associated rounds
      const processIds = processes.map((process) => process._id);

      // Find all rounds for these processes to check their status
      const rounds = await OptimizationRound.find({
        campaignProcessId: { $in: processIds },
      });

      // Group rounds by process ID for easier lookup
      const roundsByProcess = rounds.reduce<Record<string, typeof rounds>>(
        (acc, round) => {
          const processId = round.campaignProcessId.toString();
          if (!acc[processId]) {
            acc[processId] = [];
          }
          acc[processId].push(round);
          return acc;
        },
        {}
      );

      // Format the response
      const formattedProcesses = processes.map((process) => {
        const processId = process.id;
        const processRounds = roundsByProcess[processId] || [];

        // Check if any round is in WAITING_FOR_METRICS status
        const hasWaitingForMetricsRound = processRounds.some(
          (round) => round.status === OptimizationStatus.WAITING_FOR_METRICS
        );

        // Override the status if necessary
        let displayStatus = process.status;
        if (hasWaitingForMetricsRound && process.status === "processing") {
          displayStatus = "waiting_for_metrics" as const;
        }

        return {
          id: process._id,
          name: process.name,
          status: displayStatus,
          createdAt: process.createdAt,
          updatedAt: process.updatedAt,
          result: process.result,
          error: process.error,
          aiProvider: process.aiProvider,
        };
      });

      res.status(200).json({
        success: true,
        processes: formattedProcesses,
      });
    } catch (error) {
      logger.error("Error listing optimization processes:", error);
      res.status(500).json({
        error: "Failed to list optimization processes",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets detailed information about an optimization process
   *
   * @param req - Express request object
   * @param res - Express response object
   */
  public static async getOptimizationDetails(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { processId } = req.params;
      if (!processId) {
        res.status(400).json({ error: "Process ID is required" });
        return;
      }

      // Check if the process belongs to the user
      const process = await CampaignProcess.findOne({
        _id: processId,
        userId,
      });

      if (!process) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      // Get all rounds for this process
      const rounds = await import("../models/optimization-round.model").then(
        (module) =>
          module.OptimizationRound.find({
            campaignProcessId: process._id,
          }).sort({ roundNumber: 1 })
      );

      // Get all segments for this process
      const segments = await import("../models/subscriber-segment.model").then(
        (module) =>
          module.SubscriberSegment.find({
            campaignProcessId: process._id,
          }).sort({ segmentNumber: 1 })
      );

      // Format the response
      const formattedRounds = rounds.map((round) => ({
        id: round._id,
        roundNumber: round.roundNumber,
        status: round.status,
        startDate: round.startDate,
        endDate: round.endDate,
        bestPerformingParameters: round.bestPerformingParameters,
        metrics: round.metrics,
        nextRoundScheduledFor: round.nextRoundScheduledFor,
      }));

      const formattedSegments = segments.map((segment) => ({
        id: segment._id,
        segmentNumber: segment.segmentNumber,
        status: segment.status,
        assignedParameters: segment.assignedParameters,
        metrics: segment.metrics,
        isControlGroup: segment.isControlGroup,
        isExplorationGroup: segment.isExplorationGroup,
        subscriberCount: segment.subscriberIds.length,
        campaignCount: segment.campaignIds.length,
      }));

      // Calculate statistics
      const totalSubscribers = segments.reduce(
        (total, segment) => total + segment.subscriberIds.length,
        0
      );

      const processedSegments = segments.filter(
        (segment) => segment.status === SegmentStatus.PROCESSED
      ).length;

      const completedRounds = rounds.filter(
        (round) => round.status === OptimizationStatus.COMPLETED
      ).length;

      res.status(200).json({
        success: true,
        process: {
          id: process._id,
          name: process.name,
          status: process.status,
          createdAt: process.createdAt,
          updatedAt: process.updatedAt,
          result: process.result,
          error: process.error,
          statistics: {
            totalRounds: rounds.length,
            completedRounds,
            totalSegments: segments.length,
            processedSegments,
            totalSubscribers,
          },
        },
        rounds: formattedRounds,
        segments: formattedSegments,
      });
    } catch (error) {
      logger.error("Error getting optimization details:", error);
      res.status(500).json({
        error: "Failed to get optimization details",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets the optimization data in a hierarchical tree structure (process -> rounds -> segments)
   *
   * @param req - Express request object
   * @param res - Express response object
   */
  public static async getOptimizationTree(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { processId } = req.params;
      if (!processId) {
        res.status(400).json({ error: "Process ID is required" });
        return;
      }

      // Fetch the campaign process with populated result fields
      const process = await CampaignProcess.findOne({
        _id: processId,
        userId,
      }).lean();

      if (!process) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      // Fetch all rounds for this process
      const rounds = await OptimizationRound.find({
        campaignProcessId: new Types.ObjectId(processId),
      })
        .sort({ roundNumber: 1 })
        .lean();

      // Group segments by round ID for efficient association later
      const roundIds = rounds.map((round) => round._id);

      // Fetch all segments for these rounds
      const segments = await SubscriberSegment.find({
        optimizationRoundId: { $in: roundIds },
      })
        .sort({ createdAt: 1 })
        .lean();

      // Group segments by round ID
      const segmentsByRound = segments.reduce<Record<string, any[]>>(
        (acc, segment) => {
          if (segment.optimizationRoundId) {
            const roundId = segment.optimizationRoundId.toString();
            if (!acc[roundId]) {
              acc[roundId] = [];
            }
            acc[roundId].push(segment);
          }
          return acc;
        },
        {}
      );

      const subscribersMap = new Map<string, string>();
      const subscriberIds = rounds
        .flatMap((t) => t.emailsSent)
        .map((t) => t?.subscriberId);

      const subscribers = await Subscriber.find({
        _id: { $in: subscriberIds },
      });

      subscribers.forEach((subscriber) => {
        subscribersMap.set(subscriber.id.toString(), subscriber.email);
      });

      // Build the hierarchical data structure
      const formattedRounds = rounds.map((round) => {
        const roundId = round._id ? round._id.toString() : "";
        const roundSegments = segmentsByRound[roundId] || [];

        // Format segments for this round
        const formattedSegments = roundSegments.map((segment) => ({
          id: segment._id,
          segmentNumber: segment.segmentNumber,
          status: segment.status,
          subscriberCount: segment.subscriberIds?.length || 0,
          assignedParameters: segment.assignedParameters,
          metrics: segment.metrics,
          campaignIds: segment.campaignIds,
          isControlGroup: segment.isControlGroup,
          createdAt: segment.createdAt,
          updatedAt: segment.updatedAt,
        }));

        // Return the formatted round with its segments
        return {
          id: round._id,
          roundNumber: round.roundNumber,
          status: round.status,
          startDate: round.startDate,
          endDate: round.endDate,
          subscriberCount: round.subscriberIds?.length || 0,
          bestPerformingParameters: round.bestPerformingParameters,
          bestPerformingEmails: round.bestPerformingEmails,
          modelPerformance: round.modelPerformance,
          metrics: round.metrics,
          emailsSent:
            round.emailsSent?.map((email) => ({
              ...email,
              subscriberEmail: subscribersMap.get(
                email.subscriberId.toString()
              ),
            })) ?? [],
          segments: formattedSegments,
        };
      });

      // Format the final response with process at the top level
      const result = {
        id: process._id,
        status: process.status,
        result: process.result,
        error: process.error,
        smtpProviderId: process.smtpProviderId,
        aiProvider: process.aiProvider,
        name: process.name,
        notified: process.notified,
        createdAt: process.createdAt,
        updatedAt: process.updatedAt,
        rounds: formattedRounds,
      };

      res.status(200).json({
        success: true,
        process: result,
      });
    } catch (error) {
      logger.error("Error fetching optimization tree data:", error);
      res.status(500).json({
        error: "Failed to fetch optimization tree data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Sends the winning email template to subscribers
   *
   * @param req - Express request object with processId and type (byConversionRate or byClickRate)
   * @param res - Express response object
   */
  public static async sendWinningEmail(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { processId } = req.params;
      const {
        type,
        subscriberListId,
        smtpProviderId,
        senderName,
        senderEmail,
      } = req.body;

      if (!processId) {
        res.status(400).json({ error: "Process ID is required" });
        return;
      }

      if (!type || !["byConversionRate", "byClickRate"].includes(type)) {
        res.status(400).json({
          error: "Valid type (byConversionRate or byClickRate) is required",
        });
        return;
      }

      if (!subscriberListId || !smtpProviderId || !senderName || !senderEmail) {
        res.status(400).json({
          error:
            "subscriberListId, smtpProviderId, senderName, and senderEmail are required",
        });
        return;
      }

      // Check if the process belongs to the user
      const process = await CampaignProcess.findOne({
        _id: processId,
        userId,
      });

      if (!process) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      // Call service to send winning email
      const result = await EmailOptimizationService.sendWinningEmail(
        processId,
        type as "byConversionRate" | "byClickRate",
        subscriberListId,
        smtpProviderId,
        senderName,
        senderEmail,
        userId
      );

      res.status(200).json({
        success: true,
        message: "Winning email sending process started",
        result,
      });
    } catch (error) {
      logger.error("Error sending winning email:", error);
      res.status(500).json({
        error: "Failed to send winning email",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
