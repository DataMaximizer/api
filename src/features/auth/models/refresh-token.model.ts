// src/models/refresh-token.model.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IRefreshToken extends Document {
	userId: Schema.Types.ObjectId;
	token: string;
	expiresAt: Date;
	issuedAt: Date;
	isRevoked: boolean;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
	userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
	token: { type: String, required: true, unique: true },
	expiresAt: { type: Date, required: true },
	issuedAt: { type: Date, default: Date.now },
	isRevoked: { type: Boolean, default: false },
});

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>(
	"RefreshToken",
	refreshTokenSchema,
);
