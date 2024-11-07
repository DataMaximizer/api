import { Request, Response } from "express";
import { FormService } from "../services/form.service";
import { IUser } from "../models/user.model";
import { Form } from "../models/form.model";

interface AuthRequest extends Request {
	user?: IUser;
	params: {
		id?: string;
	};
	body: any;
}

export class FormController {
	static async createForm(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
				});
				return;
			}

			const { defaultFields, fields, ...restFormData } = req.body;

			const defaultFieldsArray = [];
			if (defaultFields.name) {
				defaultFieldsArray.push({
					id: Date.now().toString() + "-name",
					label: "Name",
					type: "text",
					required: true,
					value: "",
				});
			}
			if (defaultFields.email) {
				defaultFieldsArray.push({
					id: Date.now().toString() + "-email",
					label: "Email",
					type: "email",
					required: true,
					value: "",
				});
			}

			const formData = {
				...restFormData,
				fields: [...defaultFieldsArray, ...fields],
				userId: req.user._id,
				defaultFields,
			};

			const form = await Form.create(formData);

			res.status(201).json({
				success: true,
				data: form,
			});
		} catch (error) {
			console.error("Error creating form:", error);
			res.status(400).json({
				success: false,
				error: "Failed to create form",
			});
		}
	}

	static async getForms(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
				});
				return;
			}

			const forms = await FormService.getForms(req.user._id.toString());
			res.json({
				success: true,
				data: forms,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: "Failed to fetch forms",
			});
		}
	}

	static async getFormById(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
				});
				return;
			}

			const form = await FormService.getFormById(
				req.params.id as string,
				req.user._id.toString(),
			);

			if (!form) {
				res.status(404).json({
					success: false,
					error: "Form not found",
				});
				return;
			}

			res.json({
				success: true,
				data: form,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: "Failed to fetch form",
			});
		}
	}

	static async updateForm(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
				});
				return;
			}

			const form = await FormService.updateForm(
				req.params.id as string,
				req.user._id.toString(),
				req.body,
			);

			if (!form) {
				res.status(404).json({
					success: false,
					error: "Form not found",
				});
				return;
			}

			res.json({
				success: true,
				data: form,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: "Failed to update form",
			});
		}
	}

	static async deleteForm(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
				});
				return;
			}

			const form = await FormService.deleteForm(
				req.params.id as string,
				req.user._id.toString(),
			);

			if (!form) {
				res.status(404).json({
					success: false,
					error: "Form not found",
				});
				return;
			}

			res.json({
				success: true,
				message: "Form deleted successfully",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: "Failed to delete form",
			});
		}
	}
}
