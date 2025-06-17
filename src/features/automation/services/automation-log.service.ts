import { AutomationLog, IAutomationLog } from "../models/automation-log.model";
import { Types } from "mongoose";

type AutomationLogData = {
  automationId: Types.ObjectId;
  nodeId: string;
  subscriberId: Types.ObjectId;
  status: "success" | "failure";
  input: Record<string, any>;
  output: Record<string, any>;
};

export class AutomationLogService {
  static async logAction(data: AutomationLogData): Promise<IAutomationLog> {
    return await AutomationLog.create(data);
  }
}
