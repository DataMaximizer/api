import mongoose, { Document, Schema } from "mongoose";

export interface ISubscriber extends Document {
	formId: Schema.Types.ObjectId;
	userId: Schema.Types.ObjectId;
	data: Record<string, any>;
	email: string;
	status: "active" | "unsubscribed" | "bounced";
	tags: string[];
	lists: Schema.Types.ObjectId[];
	lastInteraction: Date;
	metadata: {
		ip?: string;
		userAgent?: string;
		source?: string;
	};
	createdAt: Date;
	updatedAt: Date;
}

const subscriberSchema = new Schema<ISubscriber>(
	{
		formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		data: { type: Schema.Types.Mixed, required: true },
		email: { type: String, required: true },
		status: {
			type: String,
			enum: ["active", "unsubscribed", "bounced"],
			default: "active",
		},
		tags: [{ type: String }],
		lists: [{ type: Schema.Types.ObjectId, ref: "SubscriberList" }],
		lastInteraction: { type: Date, default: Date.now },
		metadata: {
			ip: String,
			userAgent: String,
			source: String,
		},
	},
	{ timestamps: true },
);

subscriberSchema.index({ userId: 1, email: 1 }, { unique: true });

subscriberSchema.index({ status: 1 });
subscriberSchema.index({ lists: 1 });
subscriberSchema.index({ tags: 1 });

export const Subscriber = mongoose.model<ISubscriber>(
	"Subscriber",
	subscriberSchema,
);
