import mongoose, { Document, Schema, Types } from "mongoose";
import { EventType } from "@core/events/event-bus";

export interface IWorkflowNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  params: Record<string, any>;
  next?: string;
  branches?: {
    true: string;
    false: string;
  };
}

const workflowNodeSchema = new Schema<IWorkflowNode>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String },
    position: {
      x: { type: Number },
      y: { type: Number },
    },
    params: { type: Schema.Types.Mixed, default: {} },
    next: { type: String },
    branches: {
      true: { type: String },
      false: { type: String },
    },
  },
  { _id: false }
);

export interface IAutomation extends Document {
  userId: Types.ObjectId;
  name: string;
  isEnabled: boolean;
  trigger: {
    id: string;
    type: EventType;
    params: Record<string, any>;
  };
  nodes: IWorkflowNode[];
  editorData: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const automationSchema = new Schema<IAutomation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
    trigger: {
      id: { type: String, required: true },
      type: { type: String, enum: Object.values(EventType), required: true },
      params: { type: Schema.Types.Mixed, default: {} },
    },
    nodes: { type: [workflowNodeSchema], default: [] },
    editorData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

automationSchema.index({ userId: 1 });

export const Automation = mongoose.model<IAutomation>(
  "Automation",
  automationSchema
);
