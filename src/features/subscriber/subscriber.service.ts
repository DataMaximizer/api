import { Subscriber, ISubscriber } from "./models/subscriber.model";
import {
  SubscriberList,
  ISubscriberList,
} from "./models/subscriber-list.model";
import { logger } from "@config/logger";
import { FilterQuery, Types } from "mongoose";
import { BlockedEmail, IBlockedEmail } from "./models/blocked-email.model";
import { Click } from "../tracking/models/click.model";

interface SubscriberInput extends Omit<Partial<ISubscriber>, "formId"> {
  formId?: string;
}

export class SubscriberService {
  static async addSubscriber(
    subscriberData: SubscriberInput
  ): Promise<ISubscriber> {
    try {
      if (subscriberData.formId) {
        const list = await SubscriberList.findOne({
          formId: subscriberData.formId,
        }).lean();
        if (list && list._id) {
          subscriberData.lists = subscriberData.lists || [];
          if (
            !subscriberData.lists.includes(
              list._id as unknown as Types.ObjectId
            )
          ) {
            subscriberData.lists.push(list._id as unknown as Types.ObjectId);
          }
        }
      }

      const subscriber = await Subscriber.create(subscriberData);

      if (subscriber.lists?.length) {
        await SubscriberList.updateMany(
          { _id: { $in: subscriber.lists } },
          { $inc: { subscriberCount: 1 } }
        );
      }

      return subscriber;
    } catch (error) {
      logger.error("Error adding subscriber:", error);
      throw error;
    }
  }

  static async createList(
    listData: Partial<ISubscriberList>
  ): Promise<ISubscriberList> {
    try {
      return await SubscriberList.create(listData);
    } catch (error) {
      logger.error("Error creating list:", error);
      throw error;
    }
  }

  static async getSubscribers(
    userId: string,
    filters: Record<string, any> = {}
  ) {
    try {
      const blockedEmails = await BlockedEmail.find({
        userId: new Types.ObjectId(userId),
      }).distinct("email");

      const query: FilterQuery<ISubscriber> = {
        userId,
        ...filters,
        email: { $nin: blockedEmails },
      };

      return await Subscriber.find(query).sort({ createdAt: -1 });
    } catch (error) {
      logger.error("Error fetching subscribers:", error);
      throw error;
    }
  }

  static async getLists(userId: string) {
    try {
      return await SubscriberList.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
          },
        },
        {
          $lookup: {
            from: "subscribers",
            localField: "_id",
            foreignField: "lists",
            as: "subscribers",
          },
        },
        {
          $addFields: {
            subscriberCount: { $size: "$subscribers" },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            createdAt: 1,
            tags: 1,
            subscriberCount: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);
    } catch (error) {
      logger.error("Error fetching lists:", error);
      throw error;
    }
  }

  static async exportSubscribers(userId: string, listId?: string) {
    try {
      const query: FilterQuery<ISubscriber> = { userId };
      if (listId) {
        query.lists = listId;
      }

      return await Subscriber.find(query).select(
        "email data tags status createdAt"
      );
    } catch (error) {
      logger.error("Error exporting subscribers:", error);
      throw error;
    }
  }

  static async blockEmail(
    userId: string,
    emails: string[]
  ): Promise<IBlockedEmail[]> {
    try {
      // Deduplicate and normalize emails
      const normalizedEmails = [
        ...new Set(emails.map((email) => email.toLowerCase())),
      ];

      const existingBlocked = await BlockedEmail.find({
        userId: new Types.ObjectId(userId),
        email: { $in: normalizedEmails },
      });

      // If all emails are already blocked, return early
      if (existingBlocked.length === normalizedEmails.length) {
        return existingBlocked;
      }

      // Filter out emails that are already blocked
      const existingEmailSet = new Set(existingBlocked.map((doc) => doc.email));
      const newEmails = normalizedEmails.filter(
        (email) => !existingEmailSet.has(email)
      );

      // Insert only new emails
      const newBlockedEmails = await BlockedEmail.insertMany(
        newEmails.map((email) => ({
          userId: new Types.ObjectId(userId),
          email: email,
        }))
      );

      return [...existingBlocked, ...newBlockedEmails];
    } catch (error) {
      logger.error("Error blocking emails:", error);
      throw error;
    }
  }

  static async getBlockedEmails(userId: string): Promise<IBlockedEmail[]> {
    try {
      return await BlockedEmail.find({
        userId: new Types.ObjectId(userId),
      }).sort({ createdAt: -1 });
    } catch (error) {
      logger.error("Error fetching blocked emails:", error);
      throw error;
    }
  }

  static async unblockEmail(id: string): Promise<void> {
    try {
      await BlockedEmail.deleteOne({
        _id: new Types.ObjectId(id),
      });
    } catch (error) {
      logger.error("Error unblocking email:", error);
      throw error;
    }
  }

  static async unsubscribe(clickId: string): Promise<void> {
    try {
      // Find the click record to get subscriber and campaign info
      const click = await Click.findById(clickId);

      if (!click) {
        throw new Error("Invalid unsubscribe link");
      }

      // Update subscriber status to unsubscribed
      await Subscriber.findByIdAndUpdate(click.subscriberId, {
        $set: {
          status: "unsubscribed",
          lastInteraction: new Date(),
          "metadata.unsubscribeDate": new Date(),
          "metadata.unsubscribeCampaignId": click.campaignId,
        },
      });
    } catch (error) {
      logger.error("Error unsubscribing:", error);
      throw error;
    }
  }

  static async updateList(
    listId: string,
    userId: string,
    updateData: Partial<ISubscriberList>
  ): Promise<ISubscriberList | null> {
    try {
      const list = await SubscriberList.findOneAndUpdate(
        {
          _id: new Types.ObjectId(listId),
          userId: new Types.ObjectId(userId),
        },
        { $set: updateData },
        { new: true }
      );

      if (!list) {
        throw new Error("List not found or unauthorized");
      }

      return list;
    } catch (error) {
      logger.error("Error updating list:", error);
      throw error;
    }
  }

  static async deleteList(listId: string, userId: string): Promise<void> {
    try {
      // First verify the list exists and belongs to the user
      const list = await SubscriberList.findOne({
        _id: new Types.ObjectId(listId),
        userId: new Types.ObjectId(userId),
      });

      if (!list) {
        throw new Error("List not found or unauthorized");
      }

      // Remove the list reference from all subscribers
      await Subscriber.updateMany(
        { lists: new Types.ObjectId(listId) },
        { $pull: { lists: new Types.ObjectId(listId) } }
      );

      // Delete the list itself
      await SubscriberList.findByIdAndDelete(listId);
    } catch (error) {
      logger.error("Error deleting list:", error);
      throw error;
    }
  }

  static async addWebhookSubscriber(
    subscriberData: Partial<ISubscriber>
  ): Promise<ISubscriber> {
    try {
      // Check if subscriber with this email already exists
      const existingSubscriber = await Subscriber.findOne({
        email: subscriberData.email,
      });

      if (existingSubscriber) {
        // Update existing subscriber with new data
        const updatedSubscriber = await Subscriber.findByIdAndUpdate(
          existingSubscriber._id,
          {
            $set: {
              lastInteraction: new Date(),
              "metadata.lastWebhookUpdate": new Date(),
            },
            $addToSet: { tags: "webhook" },
          },
          { new: true }
        );

        return updatedSubscriber!;
      }

      // Create new subscriber
      const subscriber = await Subscriber.create(subscriberData);

      return subscriber;
    } catch (error) {
      logger.error("Error adding webhook subscriber:", error);
      throw error;
    }
  }

  static async deleteSubscribers(
    userId: string,
    subscriberIds: string[]
  ): Promise<void> {
    try {
      // Convert string IDs to ObjectIds
      const objectIds = subscriberIds.map((id) => new Types.ObjectId(id));

      // Find subscribers to get their list IDs
      const subscribers = await Subscriber.find({
        _id: { $in: objectIds },
        userId: new Types.ObjectId(userId),
      }).select("lists");

      // Get unique list IDs
      const listIds = [...new Set(subscribers.flatMap((sub) => sub.lists))];

      // Delete subscribers
      await Subscriber.deleteMany({
        _id: { $in: objectIds },
        userId: new Types.ObjectId(userId),
      });

      // Update subscriber counts in lists
      if (listIds.length > 0) {
        for (const listId of listIds) {
          const subscriberCount = await Subscriber.countDocuments({
            userId: new Types.ObjectId(userId),
            lists: listId,
          });
          await SubscriberList.updateMany(
            { _id: listId },
            { $set: { subscriberCount: subscriberCount } }
          );
        }
      }
    } catch (error) {
      logger.error("Error deleting subscribers:", error);
      throw error;
    }
  }
}
