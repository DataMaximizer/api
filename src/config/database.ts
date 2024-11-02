import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI =
	process.env.MONGODB_URI || "mongodb://localhost:27017/api-boilerplate";

const options = {
	autoIndex: true,
	serverSelectionTimeoutMS: 30000,
	connectTimeoutMS: 30000,
	socketTimeoutMS: 45000,
};

export async function connectDB(): Promise<void> {
	try {
		mongoose.set("strictQuery", true);

		await mongoose.connect(MONGODB_URI, options);

		logger.info("Successfully connected to MongoDB.");

		mongoose.connection.on("error", (error) => {
			logger.error("MongoDB connection error:", error);
		});

		mongoose.connection.on("disconnected", () => {
			logger.warn("MongoDB disconnected. Attempting to reconnect...");
		});
	} catch (error) {
		logger.error("Failed to connect to MongoDB:", error);
		process.exit(1);
	}
}
