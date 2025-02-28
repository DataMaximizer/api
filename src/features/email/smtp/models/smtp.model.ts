import mongoose, { Document, Schema } from "mongoose";

export interface ISmtpProvider extends Document {
  _id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  mail: string;
  password: string;
  brevoApiKey?: string;
  userId: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const smtpProviderSchema = new Schema<ISmtpProvider>(
  {
    name: { type: String, required: true },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, default: true },
    fromEmail: { type: String, required: true },
    fromName: { type: String, required: true },
    mail: { type: String, required: true },
    password: { type: String, required: true },
    brevoApiKey: { type: String, required: false },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

smtpProviderSchema.index({ userId: 1, name: 1 }, { unique: true });

export const SmtpProvider = mongoose.model<ISmtpProvider>(
  "SmtpProvider",
  smtpProviderSchema
);
