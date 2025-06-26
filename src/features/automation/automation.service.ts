import { Automation, IAutomation } from "./models/automation.model";
import { Types } from "mongoose";
import { EventType } from "@core/events/event-bus";

const triggerTypeMap: { [key: string]: EventType } = {
  "New Lead": EventType.NEW_LEAD,
  Click: EventType.CLICK,
};

export class AutomationService {
  static async createAutomation(
    data: Omit<IAutomation, "userId" | "trigger"> & {
      trigger: { type: string };
    }
  ): Promise<IAutomation> {
    const { trigger, ...restOfData } = data;

    const mappedTriggerType = triggerTypeMap[trigger.type];
    if (!mappedTriggerType) {
      throw new Error(`Invalid trigger type: ${trigger.type}`);
    }

    const automationData = {
      ...restOfData,
      trigger: {
        ...trigger,
        type: mappedTriggerType,
      },
    };

    return await Automation.create(automationData);
  }

  static async getAutomations(userId: string): Promise<IAutomation[]> {
    return await Automation.find({ userId: new Types.ObjectId(userId) }).sort({
      createdAt: -1,
    });
  }

  static async getAutomationById(
    id: string,
    userId: string
  ): Promise<IAutomation | null> {
    return await Automation.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
  }

  static async updateAutomation(
    id: string,
    userId: string,
    updates: Partial<IAutomation>
  ): Promise<IAutomation | null> {
    if (updates.trigger && (updates.trigger as any).type) {
      const mappedTriggerType = triggerTypeMap[(updates.trigger as any).type];
      if (mappedTriggerType) {
        updates.trigger.type = mappedTriggerType;
      }
    }
    return await Automation.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: updates },
      { new: true }
    );
  }

  static async deleteAutomation(id: string, userId: string): Promise<void> {
    await Automation.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
  }
}
