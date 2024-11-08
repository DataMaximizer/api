import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./config/database";
import { logger } from "./config/logger";
import { setupSwagger } from "./config/swagger";
import { authenticate, authorize } from "./middlewares/auth.middleware";
import { UserType } from "./models/user.model";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";

import {
	authRoutes,
	smtpRoutes,
	adminRoutes,
	trackingRoutes,
	campaignRoutes,
	affiliateRoutes,
	formRoutes,
	subscriberRoutes,
} from "./routes";

import { SchedulerService } from "./services/scheduler.service";
import swaggerJSDoc from "swagger-jsdoc";

const app = express();
const port = process.env.PORT || 5000;

dotenv.config();

const swaggerOptions = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: "API Documentation",
			version: "1.0.0",
			description: "API endpoints documentation",
		},
		servers: [
			{
				url: `http://localhost:${process.env.PORT || 5000}`,
				description: "Development server",
			},
		],
	},
	// Path to the API docs
	apis: ["./src/**/*.ts"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// CORS configuration
const corsOptions = {
	origin: "*",
	methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true,
	optionsSuccessStatus: 200,
	maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json());

setupSwagger(app);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/smtp", smtpRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/subscribers", subscriberRoutes);
app.use("/api/metrics/track", trackingRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/api/profile", authenticate, (req: Request, res: Response) => {
	res.json({ user: req.user });
});

app.get(
	"/api/admin/dashboard",
	authenticate,
	authorize([UserType.OWNER]),
	(req: Request, res: Response) => {
		res.json({ message: "Admin access granted" });
	},
);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
	logger.error("Error:", err);
	res.status(500).json({ error: err.message });
});

const startServer = async (): Promise<void> => {
	try {
		await connectDB();

		SchedulerService.initializeScheduledTasks();

		app.listen(port, () => {
			logger.info(`Server running on port ${port}`);
			logger.info(
				`Swagger documentation available at http://localhost:${port}/api-docs`,
			);
		});
	} catch (error) {
		logger.error("Failed to start server:", error);
		process.exit(1);
	}
};

startServer();

export default app;
