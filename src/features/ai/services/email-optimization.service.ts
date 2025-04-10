import { IAddress } from "@/features/user/models/user.model";

import { Subscriber } from "@/features/subscriber/models/subscriber.model";
import { CampaignProcess } from "../models/campaign-process.model";
import {
  Campaign,
  CampaignType,
  CampaignStatus,
} from "@features/campaign/models/campaign.model";
import { CampaignService } from "@features/campaign/campaign.service";
import { User } from "@features/user/models/user.model";
import { Types } from "mongoose";
import { logger } from "@config/logger";

export class EmailOptimizationService {
  /**
   * Sends the winning email template to subscribers
   *
   * @param processId - ID of the optimization process
   * @param type - Type of winning email (byConversionRate or byClickRate)
   * @param subscriberListId - ID of the subscriber list to send to
   * @param smtpProviderId - ID of the SMTP provider to use
   * @param senderName - Name of the sender
   * @param senderEmail - Email of the sender
   * @param userId - ID of the user
   * @returns Result object with campaign ID and status
   */
  public static async sendWinningEmail(
    processId: string,
    type: "byConversionRate" | "byClickRate",
    subscriberListId: string,
    smtpProviderId: string,
    senderName: string,
    senderEmail: string,
    userId: string
  ): Promise<{ campaignId: string; status: string }> {
    // Get the campaign process
    const process = await CampaignProcess.findById(processId);
    if (!process || !process.result?.bestPerformingEmails) {
      throw new Error("Process or best performing emails not found");
    }

    // Get the winning email based on type
    const winningEmails = process.result.bestPerformingEmails[type];
    if (!winningEmails || winningEmails.length === 0) {
      throw new Error(`No winning emails found for ${type}`);
    }

    // Get the top performing email
    const winningEmail = winningEmails[0];
    if (
      !winningEmail.subscriberIds ||
      winningEmail.subscriberIds.length === 0
    ) {
      throw new Error("Original subscriber ID not found for winning email");
    }

    // Get the original subscriber to extract their info
    const originalSubscribers = await Subscriber.find({
      _id: { $in: winningEmail.subscriberIds },
    });

    // Helper function to escape special regex characters
    function escapeRegExp(string: string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
    }

    let subjectTemplate = winningEmail.subject;
    let contentTemplate = winningEmail.content;

    for (const originalSubscriber of originalSubscribers) {
      subjectTemplate = subjectTemplate.replace(
        new RegExp(`\\b${escapeRegExp(originalSubscriber.data.name)}\\b`, "g"),
        "{subscriberName}"
      );

      contentTemplate = contentTemplate.replace(
        new RegExp(`\\b${escapeRegExp(originalSubscriber.data.name)}\\b`, "g"),
        "{subscriberName}"
      );
    }

    // Use a regular expression to find all <a> tags with href attributes
    const anchorRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>(.*?)<\/a>/g;
    contentTemplate = contentTemplate.replace(
      anchorRegex,
      (match, url, attributes, text) => {
        // Replace the actual URL with the placeholder, but keep the rest of the tag intact
        return `<a href="{offer_url}"${attributes}>${text}</a>`;
      }
    );

    // Get subscribers from the list
    const subscribers = await Subscriber.find({
      lists: { $in: [new Types.ObjectId(subscriberListId)] },
      status: "active",
    });

    if (subscribers.length === 0) {
      throw new Error("No subscribers found in the list");
    }

    // Create a campaign for this winning email
    const campaign = await Campaign.create({
      name: `Winning Email (${process.name})`,
      type: CampaignType.EMAIL,
      status: CampaignStatus.RUNNING,
      userId: new Types.ObjectId(userId),
      offerId: new Types.ObjectId(winningEmail.offerId),
      subject: subjectTemplate,
      content: contentTemplate,
      framework: winningEmail.styleParameters.copywritingStyle,
      tone: winningEmail.styleParameters.tone,
      writingStyle: winningEmail.styleParameters.writingStyle,
      personality: winningEmail.styleParameters.personality,
      smtpProviderId: new Types.ObjectId(smtpProviderId),
      campaignProcessId: new Types.ObjectId(processId),
      metrics: {
        totalSent: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
      },
    });

    // Get user website URL
    const user = await User.findById(userId);
    const websiteUrl = user?.companyUrl;
    if (!websiteUrl) {
      throw new Error("User website URL not found");
    }

    // Process subscribers in batches
    const BATCH_SIZE = 25;
    let totalProcessed = 0;

    logger.info(
      `Starting to send winning email to ${subscribers.length} subscribers`
    );

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);

      try {
        // Create personalized emails for each subscriber
        const emailPromises = batch.map((subscriber) => {
          return CampaignService.sendCampaignEmail(
            winningEmail.offerId.toString(),
            subscriber.id,
            campaign.id,
            smtpProviderId,
            contentTemplate,
            subjectTemplate,
            websiteUrl,
            user?.address as IAddress,
            user?.companyName as string,
            senderName,
            senderEmail
          );
        });

        // Wait for batch to complete
        await Promise.all(emailPromises);
        totalProcessed += batch.length;

        logger.info(`Processed ${totalProcessed}/${subscribers.length} emails`);

        // Small delay between batches
        if (i + BATCH_SIZE < subscribers.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(`Error processing batch starting at index ${i}:`, error);
        // Continue with the next batch despite errors
      }
    }

    logger.info(
      `Finished sending winning email campaign. Total sent: ${totalProcessed}`
    );

    return {
      campaignId: campaign.id,
      status: "processing",
    };
  }
}
