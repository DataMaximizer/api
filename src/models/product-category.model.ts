import mongoose, { Document, Schema } from "mongoose";

export interface IProductCategory extends Document {
	name: string;
	description: string;
	parentCategory?: Schema.Types.ObjectId;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

const productCategorySchema = new Schema<IProductCategory>(
	{
		name: { type: String, required: true },
		description: { type: String, required: true },
		parentCategory: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

export const ProductCategory = mongoose.model<IProductCategory>(
	"ProductCategory",
	productCategorySchema,
);
