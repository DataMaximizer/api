import mongoose, { Document, Schema } from "mongoose";

export interface ILinkValidation extends Document {
	offerId: Schema.Types.ObjectId;
	checkedAt: Date;
	isValid: boolean;
	statusCode?: number;
	responseTime?: number;
	errorMessage?: string;
}

const linkValidationSchema = new Schema<ILinkValidation>({
	offerId: {
		type: Schema.Types.ObjectId,
		ref: "AffiliateOffer",
		required: true,
	},
	checkedAt: { type: Date, default: Date.now },
	isValid: { type: Boolean, required: true },
	statusCode: { type: Number },
	responseTime: { type: Number },
	errorMessage: { type: String },
});

export const LinkValidation = mongoose.model<ILinkValidation>(
	"LinkValidation",
	linkValidationSchema,
);
