import { Request, Response } from "express";
import { SmtpProvider } from "../models/smtp.model";
import { logger } from "../config/logger";

class SmtpController {
	async createProvider(req: Request, res: Response): Promise<void> {
		try {
			// Check for existing provider with same name for this user
			const existing = await SmtpProvider.findOne({
				userId: req.user?.id,
				name: req.body.name,
			});

			if (existing) {
				res.status(400).json({
					message: "An SMTP provider with this name already exists",
				});
				return;
			}

			const smtpProvider = await SmtpProvider.create({
				...req.body,
				userId: req.user?.id,
			});

			logger.info("SMTP provider created", { providerId: smtpProvider._id });

			res.status(201).json({
				message: "SMTP provider created successfully",
				data: smtpProvider,
			});
		} catch (error) {
			logger.error("Error creating SMTP provider:", error);
			res.status(500).json({
				message: "Error creating SMTP provider",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	async getProviders(req: Request, res: Response): Promise<void> {
		try {
			const providers = await SmtpProvider.find({
				userId: req.user?.id,
			}).select("-apiKey");

			res.json({
				data: providers,
			});
		} catch (error) {
			logger.error("Error fetching SMTP providers:", error);
			res.status(500).json({
				message: "Error fetching SMTP providers",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	async getProvider(req: Request, res: Response): Promise<void> {
		try {
			const provider = await SmtpProvider.findOne({
				_id: req.params.id,
				userId: req.user?.id,
			}).select("-apiKey");

			if (!provider) {
				res.status(404).json({
					message: "SMTP provider not found",
				});
				return;
			}

			res.json({
				data: provider,
			});
		} catch (error) {
			logger.error("Error fetching SMTP provider:", error);
			res.status(500).json({
				message: "Error fetching SMTP provider",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	async deleteProvider(req: Request, res: Response): Promise<void> {
		try {
			const provider = await SmtpProvider.findOneAndDelete({
				_id: req.params.id,
				userId: req.user?.id,
			});

			if (!provider) {
				res.status(404).json({
					message: "SMTP provider not found",
				});
				return;
			}

			logger.info("SMTP provider deleted", { providerId: req.params.id });

			res.json({
				message: "SMTP provider deleted successfully",
			});
		} catch (error) {
			logger.error("Error deleting SMTP provider:", error);
			res.status(500).json({
				message: "Error deleting SMTP provider",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	async updateProvider(req: Request, res: Response): Promise<void> {
		try {
			const provider = await SmtpProvider.findOneAndUpdate(
				{ _id: req.params.id, userId: req.user?.id },
				req.body,
				{ new: true },
			);

			if (!provider) {
				res.status(404).json({
					message: "SMTP provider not found",
				});
				return;
			}

			res.json({
				message: "SMTP provider updated successfully",
				data: provider,
			});
		} catch (error) {
			logger.error("Error updating SMTP provider:", error);
			res.status(500).json({
				message: "Error updating SMTP provider",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}
}

export const smtpController = new SmtpController();
