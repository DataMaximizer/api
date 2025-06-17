import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAutomationLog extends Document {
  automationId: Types.ObjectId;
  nodeId: string;
  subscriberId: Types.ObjectId;
  status: "success" | "failure";
  input: Record<string, any>;
  output: Record<string, any>;
  executedAt: Date;
}

const automationLogSchema = new Schema<IAutomationLog>({
  automationId: {
    type: Schema.Types.ObjectId,
    ref: "Automation",
    required: true,
  },
  nodeId: { type: String, required: true },
  subscriberId: {
    type: Schema.Types.ObjectId,
    ref: "Subscriber",
    required: true,
  },
  status: { type: String, enum: ["success", "failure"], required: true },
  input: { type: Schema.Types.Mixed },
  output: { type: Schema.Types.Mixed },
  executedAt: { type: Date, default: Date.now },
});

automationLogSchema.index({ automationId: 1 });
automationLogSchema.index({ subscriberId: 1 });
automationLogSchema.index({ executedAt: -1 });

export const AutomationLog = mongoose.model<IAutomationLog>(
  "AutomationLog",
  automationLogSchema
);
