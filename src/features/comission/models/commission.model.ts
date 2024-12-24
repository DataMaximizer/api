import mongoose, { Document, Schema } from "mongoose";

export enum CommissionType {
	FIXED = "fixed",
	PERCENTAGE = "percentage",
}

export enum PayoutStatus {
	PENDING = "pending",
	PROCESSING = "processing",
	PAID = "paid",
	FAILED = "failed",
}

export interface ICommissionRule extends Document {
	name: string;
	type: CommissionType;
	value: number;
	minAmount?: number;
	maxAmount?: number;
	userId: Schema.Types.ObjectId;
	offerId: Schema.Types.ObjectId;
	isAdminOffer: boolean;
	isActive: boolean;
}

export interface IPayout extends Document {
	userId: Schema.Types.ObjectId;
	amount: number;
	currency: string;
	status: PayoutStatus;
	stripePayoutId?: string;
	commissions: Schema.Types.ObjectId[];
	scheduledDate: Date;
	processedDate?: Date;
	metadata?: Record<string, any>;
}

export interface ICommission extends Document {
	userId: Schema.Types.ObjectId;
	offerId: Schema.Types.ObjectId;
	conversionId: string;
	amount: number;
	commissionAmount: number;
	currency: string;
	status: string;
	payoutId?: Schema.Types.ObjectId;
	metadata?: Record<string, any>;
}

const commissionRuleSchema = new Schema<ICommissionRule>(
	{
		name: { type: String, required: true },
		type: { type: String, enum: Object.values(CommissionType), required: true },
		value: { type: Number, required: true },
		minAmount: Number,
		maxAmount: Number,
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		offerId: {
			type: Schema.Types.ObjectId,
			ref: "AffiliateOffer",
			required: true,
		},
		isAdminOffer: { type: Boolean, required: true },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

const payoutSchema = new Schema<IPayout>(
	{
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		amount: { type: Number, required: true },
		currency: { type: String, required: true, default: "USD" },
		status: {
			type: String,
			enum: Object.values(PayoutStatus),
			default: PayoutStatus.PENDING,
		},
		stripePayoutId: String,
		commissions: [{ type: Schema.Types.ObjectId, ref: "Commission" }],
		scheduledDate: { type: Date, required: true },
		processedDate: Date,
		metadata: Schema.Types.Mixed,
	},
	{ timestamps: true },
);

const commissionSchema = new Schema<ICommission>(
	{
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		offerId: {
			type: Schema.Types.ObjectId,
			ref: "AffiliateOffer",
			required: true,
		},
		conversionId: { type: String, required: true },
		amount: { type: Number, required: true },
		commissionAmount: { type: Number, required: true },
		currency: { type: String, required: true, default: "USD" },
		status: {
			type: String,
			enum: ["pending", "approved", "rejected", "paid"],
			default: "pending",
		},
		payoutId: { type: Schema.Types.ObjectId, ref: "Payout" },
		metadata: Schema.Types.Mixed,
	},
	{ timestamps: true },
);

commissionSchema.index({ userId: 1, status: 1 });
commissionSchema.index({ offerId: 1, conversionId: 1 }, { unique: true });
payoutSchema.index({ userId: 1, status: 1 });

export const CommissionRule = mongoose.model<ICommissionRule>(
	"CommissionRule",
	commissionRuleSchema,
);
export const Payout = mongoose.model<IPayout>("Payout", payoutSchema);
export const Commission = mongoose.model<ICommission>(
	"Commission",
	commissionSchema,
);
