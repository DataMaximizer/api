import { Form, IForm } from "../models/form.model";
import { logger } from "../config/logger";

export class FormService {
	static async createForm(formData: Partial<IForm>) {
		try {
			const form = new Form(formData);
			return await form.save();
		} catch (error) {
			logger.error("Error creating form:", error);
			throw error;
		}
	}

	static async getForms(userId: string) {
		try {
			return await Form.find({ userId }).sort({ createdAt: -1 });
		} catch (error) {
			logger.error("Error fetching forms:", error);
			throw error;
		}
	}

	static async getFormById(formId: string, userId: string) {
		try {
			return await Form.findOne({ _id: formId, userId });
		} catch (error) {
			logger.error("Error fetching form:", error);
			throw error;
		}
	}

	static async updateForm(
		formId: string,
		userId: string,
		updateData: Partial<IForm>,
	) {
		try {
			return await Form.findOneAndUpdate({ _id: formId, userId }, updateData, {
				new: true,
			});
		} catch (error) {
			logger.error("Error updating form:", error);
			throw error;
		}
	}

	static async deleteForm(formId: string, userId: string) {
		try {
			return await Form.findOneAndUpdate(
				{ _id: formId, userId },
				{ status: "inactive" },
				{ new: true },
			);
		} catch (error) {
			logger.error("Error deleting form:", error);
			throw error;
		}
	}

	static async incrementSubmissions(formId: string) {
		try {
			return await Form.findByIdAndUpdate(
				formId,
				{ $inc: { submissions: 1 } },
				{ new: true },
			);
		} catch (error) {
			logger.error("Error incrementing submissions:", error);
			throw error;
		}
	}
}
