import { Request, Response } from "express";
import { SubscriberService } from "../services/subscriber.service";
import { logger } from "../config/logger";
import { IUser } from "../models/user.model";
import { Form } from "../models/form.model";
import { ISubscriber, Subscriber } from "../models/subscriber.model";
import mongoose from "mongoose";
import { Types } from "mongoose";

interface AuthRequest extends Request {
	user?: IUser;
	file?: Express.Multer.File;
}

export class SubscriberController {
	static async addSubscriber(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const subscriberData = {
				...req.body,
				userId: req.user._id,
				metadata: {
					...req.body.metadata,
					ip: req.ip,
					userAgent: req.headers["user-agent"],
				},
			};

			const subscriber = await SubscriberService.addSubscriber(subscriberData);
			res.status(201).json({ success: true, data: subscriber });
		} catch (error) {
			logger.error("Error in addSubscriber:", error);
			res
				.status(400)
				.json({ success: false, error: "Failed to add subscriber" });
		}
	}

	static async createList(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const listData = {
				...req.body,
				userId: req.user._id,
			};

			const list = await SubscriberService.createList(listData);
			res.status(201).json({ success: true, data: list });
		} catch (error) {
			logger.error("Error in createList:", error);
			res.status(400).json({ success: false, error: "Failed to create list" });
		}
	}

	static async getSubscribers(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const subscribers = await Subscriber.aggregate([
				{ $match: { userId: req.user._id } },
				{
					$addFields: {
						metrics: {
							$ifNull: [
								"$metrics",
								{
									opens: 0,
									clicks: 0,
									conversions: 0,
									bounces: 0,
									revenue: 0,
								},
							],
						},
						engagementScore: { $ifNull: ["$engagementScore", 0] },
					},
				},
			]);

			res.json({ success: true, data: subscribers });
		} catch (error) {
			logger.error("Error in getSubscribers:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to fetch subscribers" });
		}
	}

	static async getLists(req: AuthRequest, res: Response): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const lists = await SubscriberService.getLists(req.user._id.toString());
			res.json({ success: true, data: lists });
		} catch (error) {
			logger.error("Error in getLists:", error);
			res.status(500).json({ success: false, error: "Failed to fetch lists" });
		}
	}

	static async exportSubscribers(
		req: AuthRequest,
		res: Response,
	): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const { listId } = req.query;
			const subscribers = await SubscriberService.exportSubscribers(
				req.user._id.toString(),
				listId as string,
			);

			res.json({ success: true, data: subscribers });
		} catch (error) {
			logger.error("Error in exportSubscribers:", error);
			res
				.status(500)
				.json({ success: false, error: "Failed to export subscribers" });
		}
	}

	static async addPublicSubscriber(req: Request, res: Response): Promise<void> {
		try {
			const { formId, data, email, metadata } = req.body;

			if (!formId || !email) {
				res.status(400).json({
					success: false,
					error: "Form ID and email are required",
				});
				return;
			}

			const form = await Form.findById(formId).lean();

			if (!form) {
				res.status(404).json({
					success: false,
					error: "Form not found",
				});
				return;
			}

			if (!form.userId || !form.listId) {
				res.status(400).json({
					success: false,
					error: "Invalid form configuration",
				});
				return;
			}

			const subscriberData: Partial<ISubscriber> = {
				formId: new Types.ObjectId(formId),
				userId: new Types.ObjectId(form.userId),
				data: data || {},
				email: email.toLowerCase(),
				metadata: {
					...metadata,
					source: metadata?.source || "Public Form",
					timestamp: new Date().toISOString(),
				},
				status: "active",
				lastInteraction: new Date(),
				lists: [new Types.ObjectId(form.listId)],
				engagementScore: 0,
				tags: [],
				metrics: {
					opens: 0,
					clicks: 0,
					conversions: 0,
					bounces: 0,
					revenue: 0,
				},
			};

			const subscriber = await SubscriberService.addSubscriber(subscriberData);

			res.status(201).json({
				success: true,
				data: subscriber,
			});
		} catch (error) {
			logger.error("Error in addPublicSubscriber:", error);
			res.status(400).json({
				success: false,
				error: "Failed to add subscriber",
			});
		}
	}

	static async importSubscribers(
		req: AuthRequest,
		res: Response,
	): Promise<void> {
		try {
			if (!req.user?._id) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			if (!req.file) {
				res.status(400).json({ success: false, error: "No file uploaded" });
				return;
			}

			// Get the mappings from the request body
			let mappings;
			try {
				mappings = JSON.parse(req.body.mappings);
				if (!Array.isArray(mappings)) {
					throw new Error("Mappings is not an array");
				}
			} catch (error) {
				logger.error("Mappings parse error:", error);
				res
					.status(400)
					.json({ success: false, error: "Invalid mappings format" });
				return;
			}

			// Read and parse CSV
			const fileContent = req.file.buffer.toString("utf-8");
			const rows = fileContent.split("\n").filter((row) => row.trim());

			if (rows.length === 0) {
				res.status(400).json({ success: false, error: "Empty CSV file" });
				return;
			}

			const headers = rows[0].split(",").map((header) => header.trim());

			// Validate mappings against headers
			const invalidMappings = mappings.some(
				(mapping) =>
					!headers.includes(mapping.csvHeader) || !mapping.mappedField,
			);

			if (invalidMappings) {
				res
					.status(400)
					.json({ success: false, error: "Invalid field mappings" });
				return;
			}

			// Process each row
			const subscribers = [];
			let importedCount = 0;
			let errorCount = 0;
			let errorDetails = [];

			for (let i = 1; i < rows.length; i++) {
				try {
					const row = rows[i].split(",").map((cell) => cell.trim());

					// Create subscriber data structure matching ISubscriber interface
					const subscriberData: Partial<ISubscriber> = {
						userId: new mongoose.Types.ObjectId(req.user._id.toString()),
						status: "active",
						lastInteraction: new Date(),
						data: {},
						metrics: {
							opens: 0,
							clicks: 0,
							conversions: 0,
							bounces: 0,
							revenue: 0,
						},
						tags: [],
						engagementScore: 0,
					};

					// Map fields according to mappings
					for (const mapping of mappings) {
						const columnIndex = headers.indexOf(mapping.csvHeader);
						if (columnIndex === -1) continue;

						const value = row[columnIndex]?.trim();
						if (!value) continue;

						switch (mapping.mappedField) {
							case "email":
								// Validate email format
								if (value.includes("@")) {
									subscriberData.email = value.toLowerCase();
								}
								break;

							case "tags":
								// Split tags by semicolon and clean
								subscriberData.tags = value
									.split(";")
									.map((tag) => tag.trim())
									.filter((tag) => tag.length > 0);
								break;

							case "status":
								// Validate status is one of the allowed values
								if (["active", "inactive", "unsubscribed"].includes(value)) {
									subscriberData.status = value as
										| "active"
										| "inactive"
										| "unsubscribed";
								}
								break;

							default:
								// Store other fields in the data object
								if (subscriberData.data) {
									subscriberData.data[mapping.mappedField] = value;
								}
						}
					}

					// Validate required fields
					if (!subscriberData.email) {
						throw new Error("Missing or invalid email");
					}

					// Check for existing subscriber with same email
					const existingSubscriber = await Subscriber.findOne({
						email: subscriberData.email,
						userId: new mongoose.Types.ObjectId(req.user._id.toString()),
					});

					if (existingSubscriber) {
						// Update existing subscriber
						await Subscriber.updateOne(
							{ _id: existingSubscriber._id },
							{
								$set: {
									status: subscriberData.status,
									data: { ...existingSubscriber.data, ...subscriberData.data },
									tags: [
										...new Set([
											...existingSubscriber.tags,
											...(subscriberData.tags || []),
										]),
									],
									lastInteraction: new Date(),
								},
							},
						);
					} else {
						// Add new subscriber
						subscribers.push(subscriberData);
					}

					importedCount++;
				} catch (error) {
					errorCount++;
					errorDetails.push(
						`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			}

			// Batch insert new subscribers
			if (subscribers.length > 0) {
				await Subscriber.insertMany(subscribers, { ordered: false });
			}

			// Log success
			logger.info("Import completed", {
				userId: req.user._id,
				imported: importedCount,
				errors: errorCount,
				total: rows.length - 1,
			});

			res.status(200).json({
				success: true,
				data: {
					imported: importedCount,
					errors: errorCount,
					total: rows.length - 1,
					errorDetails,
				},
			});
		} catch (error) {
			logger.error("Error in importSubscribers:", error);
			res.status(500).json({
				success: false,
				error: "Failed to import subscribers",
				details: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}
}
