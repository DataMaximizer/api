import { EventEmitter } from "events";
import {
  CampaignProcess,
  ICampaignProcess,
} from "../models/campaign-process.model";
import { logger } from "@config/logger";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { User } from "@features/user/models/user.model";

interface CampaignStatus {
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
}

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

  async createCampaign(userId: string): Promise<ICampaignProcess> {
    try {
      const campaignProcess = new CampaignProcess({
        userId,
        status: "pending",
      });
      return await campaignProcess.save();
    } catch (error) {
      logger.error("Error creating campaign process:", error);
      throw error;
    }
  }

  async updateCampaignStatus(
    campaignProcessId: string,
    status: CampaignStatus,
    smtpProviderId: string
  ): Promise<ICampaignProcess | null> {
    try {
      const campaignProcess = await CampaignProcess.findByIdAndUpdate(
        campaignProcessId,
        {
          status: status.status,
          ...(status.result && { result: status.result }),
          ...(status.error && { error: status.error }),
        },
        { new: true }
      );

      if (campaignProcess) {
        if (status.status === "completed" || status.status === "failed") {
          // Emit to user-specific channel instead of campaign-specific
          this.campaignEmitter.emit(
            `user-${campaignProcess.userId}`,
            campaignProcess
          );
          await this.sendStatusNotification(campaignProcess, smtpProviderId);
        }
      }

      return campaignProcess;
    } catch (error) {
      logger.error("Error updating campaign process status:", error);
      throw error;
    }
  }

  private async sendStatusNotification(
    campaign: ICampaignProcess,
    smtpProviderId: string
  ): Promise<void> {
    try {
      // Skip if already notified
      if (campaign.notified) return;

      const user = await User.findById(campaign.userId);
      if (!user?.email) return;

      await SmtpService.sendEmail({
        providerId: smtpProviderId,
        to: user.email,
        subject: `Campaign ${
          campaign.status === "completed" ? "Completed" : "Failed"
        }`,
        html: `Your automated emails processing has ${campaign.status}. ${
          campaign.error ? `Error: ${campaign.error}` : ""
        }`,
        senderName: "Inbox Engine",
        senderEmail: "info@inboxengine.ai",
      });

      // Mark as notified after sending email
      await CampaignProcess.findByIdAndUpdate(campaign._id, { notified: true });
    } catch (error) {
      logger.error("Error sending campaign notification:", error);
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
