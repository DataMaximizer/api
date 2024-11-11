import mongoose, { Document, Schema } from "mongoose";

export enum SmsType {
	PROMOTIONAL = "promotional",
	TRANSACTIONAL = "transactional",
}

export interface ISmsTemplate extends Document {
	name: string;
	content: string;
	type: SmsType;
	userId: Schema.Types.ObjectId;
	variables: string[];
	maxLength: number;
	isActive: boolean;
}

export interface ISmsProvider extends Document {
	name: string;
	type: string; // twilio, messagebird, etc
	apiKey: string;
	apiSecret: string;
	senderId: string;
	userId: Schema.Types.ObjectId;
	isActive: boolean;
	webhookUrl?: string;
	metadata?: Record<string, any>;
}

export interface ISmsCampaign extends Document {
	name: string;
	template: Schema.Types.ObjectId;
	provider: Schema.Types.ObjectId;
	segments: Schema.Types.ObjectId[];
	schedule: {
		startDate: Date;
		endDate?: Date;
		sendTime?: string;
	};
	status: string;
	metrics: {
		sent: number;
		delivered: number;
		failed: number;
		responses: number;
		optouts: number;
	};
	userId: Schema.Types.ObjectId;
	metadata?: Record<string, any>;
}

const smsTemplateSchema = new Schema<ISmsTemplate>(
	{
		name: { type: String, required: true },
		content: { type: String, required: true },
		type: { type: String, enum: Object.values(SmsType), required: true },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		variables: [{ type: String }],
		maxLength: { type: Number, default: 160 },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

const smsProviderSchema = new Schema<ISmsProvider>(
	{
		name: { type: String, required: true },
		type: { type: String, required: true },
		apiKey: { type: String, required: true },
		apiSecret: { type: String, required: true },
		senderId: { type: String, required: true },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		isActive: { type: Boolean, default: true },
		webhookUrl: String,
		metadata: Schema.Types.Mixed,
	},
	{ timestamps: true },
);

const smsCampaignSchema = new Schema<ISmsCampaign>(
	{
		name: { type: String, required: true },
		template: {
			type: Schema.Types.ObjectId,
			ref: "SmsTemplate",
			required: true,
		},
		provider: {
			type: Schema.Types.ObjectId,
			ref: "SmsProvider",
			required: true,
		},
		segments: [{ type: Schema.Types.ObjectId, ref: "Segment" }],
		schedule: {
			startDate: { type: Date, required: true },
			endDate: Date,
			sendTime: String,
		},
		status: {
			type: String,
			enum: ["draft", "scheduled", "running", "completed", "paused"],
			default: "draft",
		},
		metrics: {
			sent: { type: Number, default: 0 },
			delivered: { type: Number, default: 0 },
			failed: { type: Number, default: 0 },
			responses: { type: Number, default: 0 },
			optouts: { type: Number, default: 0 },
		},
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		metadata: Schema.Types.Mixed,
	},
	{ timestamps: true },
);

export const SmsTemplate = mongoose.model<ISmsTemplate>(
	"SmsTemplate",
	smsTemplateSchema,
);
export const SmsProvider = mongoose.model<ISmsProvider>(
	"SmsProvider",
	smsProviderSchema,
);
export const SmsCampaign = mongoose.model<ISmsCampaign>(
	"SmsCampaign",
	smsCampaignSchema,
);
