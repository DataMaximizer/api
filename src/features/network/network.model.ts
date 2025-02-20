import mongoose, { Document, Schema } from "mongoose";

export interface INetwork extends Document {
  name: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const networkSchema = new Schema<INetwork>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export const Network = mongoose.model<INetwork>("Network", networkSchema);
