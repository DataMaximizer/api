import {
  AutomationExecution,
  ExecutionStatus,
} from "../models/automation-execution.model";
import { automationEngine } from "./automation-engine.service";
import { logger } from "@config/logger";
import { Types } from "mongoose";

export class WorkflowSchedulerService {
  private static instance: WorkflowSchedulerService;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): WorkflowSchedulerService {
    if (!WorkflowSchedulerService.instance) {
      WorkflowSchedulerService.instance = new WorkflowSchedulerService();
    }
    return WorkflowSchedulerService.instance;
  }

  public initialize(): void {
    if (this.checkInterval) {
      return;
    }
    logger.info("WorkflowSchedulerService initialized");
    this.checkInterval = setInterval(
      () => this.checkPendingExecutions(),
      60 * 1000 // Check every minute
    );
  }

  public async schedule(
    automationId: string,
    subscriberId: string,
    nextNodeId: string,
    delayParams: any
  ): Promise<void> {
    const resumeAt = this.calculateResumeAt(delayParams);
    await AutomationExecution.findOneAndUpdate(
      {
        automationId: new Types.ObjectId(automationId),
        subscriberId: new Types.ObjectId(subscriberId),
      },
      {
        automationId: new Types.ObjectId(automationId),
        subscriberId: new Types.ObjectId(subscriberId),
        currentNodeId: nextNodeId,
        status: ExecutionStatus.PAUSED,
        resumeAt,
        context: {},
      },
      { upsert: true, new: true }
    );
  }

  private async checkPendingExecutions(): Promise<void> {
    const pending = await AutomationExecution.find({
      status: ExecutionStatus.PAUSED,
      resumeAt: { $lte: new Date() },
    }).limit(100);

    if (pending.length > 0) {
      logger.info(`Resuming ${pending.length} paused workflow(s)`);
    }

    for (const execution of pending) {
      try {
        await AutomationExecution.findByIdAndUpdate(execution._id, {
          status: ExecutionStatus.ACTIVE,
        });
        await automationEngine.resumeAutomation(execution);
      } catch (error) {
        logger.error(
          `Failed to resume automation execution ${execution.id}`,
          error
        );
        await AutomationExecution.findByIdAndUpdate(execution._id, {
          status: ExecutionStatus.FAILED,
          error: (error as Error).message,
        });
      }
    }
  }

  private calculateResumeAt(params: any): Date {
    const now = new Date();
    const {
      delayType,
      delayAmount,
      delayUnit,
      timeOfDay,
      daysOfWeek,
      specificDateTime,
    } = params;

    let resume = new Date();

    switch (delayType) {
      case "period":
        const amount = parseInt(delayAmount, 10);
        if (delayUnit === "Minutes")
          resume.setMinutes(now.getMinutes() + amount);
        if (delayUnit === "Hours") resume.setHours(now.getHours() + amount);
        if (delayUnit === "Days") resume.setDate(now.getDate() + amount);
        if (delayUnit === "Weeks") resume.setDate(now.getDate() + amount * 7);
        break;
      case "timeOfDay":
        const [hour, minute] = timeOfDay.split(":").map(Number);
        resume.setHours(hour, minute, 0, 0);
        if (resume <= now) {
          resume.setDate(resume.getDate() + 1);
        }
        break;
      case "dateAndTime":
        resume = new Date(specificDateTime);
        break;
      case "dayOfWeek":
        const dayMap: { [key: string]: number } = {
          Sun: 0,
          Mon: 1,
          Tue: 2,
          Wed: 3,
          Thu: 4,
          Fri: 5,
          Sat: 6,
        };
        const allowedDays = Object.entries(daysOfWeek)
          .filter(([, allowed]) => allowed)
          .map(([day]) => dayMap[day as keyof typeof dayMap]);

        if (allowedDays.length === 0) {
          resume.setMinutes(now.getMinutes() + 5); // Default if no day selected
          break;
        }

        const resumeHour = 12; // Default to noon
        const resumeMinute = 0;

        // Find the next valid date within the next 7 days
        for (let i = 0; i < 7; i++) {
          const futureDate = new Date(now);
          futureDate.setDate(now.getDate() + i);
          const dayOfWeek = futureDate.getDay();

          if (allowedDays.includes(dayOfWeek)) {
            futureDate.setHours(resumeHour, resumeMinute, 0, 0);
            if (futureDate > now) {
              resume = futureDate;
              // Early exit once we find the first valid future time
              return resume;
            }
          }
        }

        // If we reach here, no valid time was found in the next 7 days.
        // This can happen if the only allowed day is today, but the time has passed.
        // So, find the first allowed day of next week.
        allowedDays.sort((a, b) => a - b);
        const firstDayNextWeek = allowedDays[0];
        const daysToAdd = (7 - now.getDay() + firstDayNextWeek) % 7;
        const finalDaysToAdd = daysToAdd === 0 ? 7 : daysToAdd;

        resume.setDate(now.getDate() + finalDaysToAdd);
        resume.setHours(resumeHour, resumeMinute, 0, 0);
        break;
      // 'customField' require more complex logic
      // and potentially access to subscriber data.
      // For now, we'll make them default to a short delay.
      case "customField":
      default:
        resume.setMinutes(now.getMinutes() + 5); // Default to 5 mins
        break;
    }
    return resume;
  }
}

export const workflowSchedulerService = WorkflowSchedulerService.getInstance();
