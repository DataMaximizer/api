import { Subscriber, ISubscriber } from "./models/subscriber.model";
import {
  SubscriberList,
  ISubscriberList,
} from "./models/subscriber-list.model";
import { logger } from "@config/logger";
import { FilterQuery } from "mongoose";

export class SubscriberService {
  static async addSubscriber(
    subscriberData: Partial<ISubscriber>,
  ): Promise<ISubscriber> {
    try {
      const subscriber = await Subscriber.create(subscriberData);

      if (subscriber.lists?.length) {
        await SubscriberList.updateMany(
          { _id: { $in: subscriber.lists } },
          { $inc: { subscriberCount: 1 } },
        );
      }

      return subscriber;
    } catch (error) {
      logger.error("Error adding subscriber:", error);
      throw error;
    }
  }

  static async createList(
    listData: Partial<ISubscriberList>,
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
    filters: Record<string, any> = {},
  ) {
    try {
      const query: FilterQuery<ISubscriber> = { userId, ...filters };
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
        "email data tags status createdAt",
      );
    } catch (error) {
      logger.error("Error exporting subscribers:", error);
      throw error;
    }
  }
}
