import { EventEmitter } from "events";
import {
  CampaignProcess,
  ICampaignProcess,
} from "../models/campaign-process.model";
import { logger } from "@config/logger";

export class CampaignTrackerService {
  private static instance: CampaignTrackerService;
  private campaignEmitter: EventEmitter;

  private constructor() {
    this.campaignEmitter = new EventEmitter();
  }

  static getInstance(): CampaignTrackerService {
    if (!CampaignTrackerService.instance) {
      CampaignTrackerService.instance = new CampaignTrackerService();
    }
    return CampaignTrackerService.instance;
  }

  async createCampaign(
    userId: string,
    aiProvider: "openai" | "claude"
  ): Promise<ICampaignProcess> {
    try {
      const campaignProcess = new CampaignProcess({
        userId,
        status: "pending",
        aiProvider,
      });
      return await campaignProcess.save();
    } catch (error) {
      logger.error("Error creating campaign process:", error);
      throw error;
    }
  }

  async getCampaignStatus(
    campaignProcessId: string
  ): Promise<ICampaignProcess | null> {
    try {
      return await CampaignProcess.findById(campaignProcessId);
    } catch (error) {
      logger.error("Error getting campaign process status:", error);
      throw error;
    }
  }

  async getUserCampaigns(userId: string): Promise<ICampaignProcess[]> {
    try {
      return await CampaignProcess.find({ userId }).sort({ createdAt: -1 });
    } catch (error) {
      logger.error("Error getting user campaign processes:", error);
      throw error;
    }
  }

  subscribeToUserUpdates(
    userId: string,
    listener: (status: any) => void
  ): void {
    this.campaignEmitter.on(`user-${userId}`, listener);
  }

  unsubscribeFromUserUpdates(
    userId: string,
    listener: (status: any) => void
  ): void {
    this.campaignEmitter.off(`user-${userId}`, listener);
  }
}
