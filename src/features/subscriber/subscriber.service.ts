import { Subscriber, ISubscriber } from "./models/subscriber.model";
import {
  SubscriberList,
  ISubscriberList,
} from "./models/subscriber-list.model";
import { logger } from "@config/logger";
import { FilterQuery, Types } from "mongoose";
import { BlockedEmail, IBlockedEmail } from "./models/blocked-email.model";

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
      return await SubscriberList.find({ userId }).sort({ createdAt: -1 });
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
    email: string
  ): Promise<IBlockedEmail> {
    try {
      const blockedEmail = await BlockedEmail.create({
        userId: new Types.ObjectId(userId),
        email: email.toLowerCase(),
      });

      return blockedEmail;
    } catch (error) {
      logger.error("Error blocking email:", error);
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
}
