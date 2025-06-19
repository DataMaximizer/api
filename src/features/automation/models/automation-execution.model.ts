import mongoose, { Document, Schema, Types } from "mongoose";

export enum ExecutionStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface IAutomationExecution extends Document {
  automationId: Types.ObjectId;
  subscriberId: Types.ObjectId;
  currentNodeId: string;
  status: ExecutionStatus;
  resumeAt?: Date;
  context: Record<string, any>;
  error?: string;
}

const automationExecutionSchema = new Schema<IAutomationExecution>(
  {
    automationId: {
      type: Schema.Types.ObjectId,
      ref: "Automation",
      required: true,
    },
    subscriberId: {
      type: Schema.Types.ObjectId,
      ref: "Subscriber",
      required: true,
    },
    currentNodeId: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ExecutionStatus),
      required: true,
    },
    resumeAt: { type: Date },
    context: { type: Schema.Types.Mixed, default: {} },
    error: { type: String },
  },
  { timestamps: true }
);

automationExecutionSchema.index({ status: 1, resumeAt: 1 });
automationExecutionSchema.index({ subscriberId: 1, automationId: 1 });

export const AutomationExecution = mongoose.model<IAutomationExecution>(
  "AutomationExecution",
  automationExecutionSchema
);
