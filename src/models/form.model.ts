import mongoose, { Document, Schema } from "mongoose";

export interface IFormField {
	id: string;
	label: string;
	type: string;
	required: boolean;
	minLength?: number;
	maxLength?: number;
	value: string;
	options?: string[];
}

export interface IForm extends Document {
	title: string;
	userId: Schema.Types.ObjectId;
	fields: IFormField[];
	style: {
		type: "material" | "minimalistic" | "concise";
		primaryColor: string;
	};
	defaultFields: {
		name: boolean;
		email: boolean;
	};
	status: "active" | "draft";
	createdAt: Date;
	updatedAt: Date;
}

const formFieldSchema = new Schema(
	{
		id: { type: String, required: true },
		label: { type: String, required: true },
		type: { type: String, required: true },
		required: { type: Boolean, default: false },
		minLength: { type: Number },
		maxLength: { type: Number },
		value: { type: String, default: "" },
		options: [{ type: String }],
	},
	{ _id: false },
);

const formSchema = new Schema<IForm>(
	{
		title: { type: String, required: true },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		fields: [formFieldSchema],
		style: {
			type: {
				type: String,
				enum: ["material", "minimalistic", "concise"],
				default: "material",
			},
			primaryColor: { type: String, default: "#1a237e" },
		},
		defaultFields: {
			name: { type: Boolean, default: true },
			email: { type: Boolean, default: true },
		},
		status: {
			type: String,
			enum: ["active", "draft"],
			default: "draft",
		},
	},
	{
		timestamps: true,
	},
);

export const Form = mongoose.model<IForm>("Form", formSchema);
