import mongoose, { Document, Schema } from "mongoose";

export interface IPrompt extends Document {
  name: string;
  text: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const promptSchema = new Schema<IPrompt>(
  {
    name: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export const Prompt = mongoose.model<IPrompt>("Prompt", promptSchema);
