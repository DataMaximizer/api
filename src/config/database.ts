import mongoose from "mongoose";
import { logger } from "./logger";

require("dotenv").config();

const options: mongoose.ConnectOptions = {
	autoIndex: true,
	maxPoolSize: 10,
	serverSelectionTimeoutMS: 5000,
	socketTimeoutMS: 45000,
	family: 4,
	// keepAlive: true,
	// keepAliveInitialDelay: 300000,
};

export async function connectDB(): Promise<void> {
	try {
		mongoose.connection.on("connected", () => {
			logger.info("MongoDB connected successfully");
		});

		mongoose.connection.on("error", (error) => {
			logger.error("MongoDB connection error:", error);
		});

		mongoose.connection.on("disconnected", () => {
			logger.warn("MongoDB disconnected. Attempting to reconnect...");
		});

		process.on("SIGINT", async () => {
			try {
				await mongoose.connection.close();
				logger.info("MongoDB connection closed through app termination");
				process.exit(0);
			} catch (err) {
				logger.error("Error closing MongoDB connection:", err);
				process.exit(1);
			}
		});

		await mongoose.connect(process.env.MONGODB_URI || "", options);
	} catch (error) {
		logger.error("Failed to connect to MongoDB:", error);
		process.exit(1);
	}
}
