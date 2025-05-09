import mongoose, { Document, Schema } from "mongoose";

export interface ISubscriberList extends Document {
	name: string;
	description: string;
	userId: mongoose.Types.ObjectId;
	subscriberCount: number;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
}

const subscriberListSchema = new Schema<ISubscriberList>(
	{
		name: { type: String, required: true },
		description: { type: String },
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		subscriberCount: { type: Number, default: 0 },
		tags: [{ type: String }],
	},
	{ timestamps: true },
);

subscriberListSchema.index({ userId: 1, name: 1 }, { unique: true });

export const SubscriberList = mongoose.model<ISubscriberList>(
	"SubscriberList",
	subscriberListSchema,
);
