import mongoose, { Document, Schema } from "mongoose";

export interface ISubscriberList extends Document {
	name: string;
	description: string;
	userId: Schema.Types.ObjectId;
	subscriberCount: number;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
}

const subscriberListSchema = new Schema<ISubscriberList>(
	{
		name: { type: String, required: true },
		description: { type: String },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		subscriberCount: { type: Number, default: 0 },
		tags: [{ type: String }],
	},
	{ timestamps: true },
);

// Ensure user can't create duplicate list names
subscriberListSchema.index({ userId: 1, name: 1 }, { unique: true });

export const SubscriberList = mongoose.model<ISubscriberList>(
	"SubscriberList",
	subscriberListSchema,
);
