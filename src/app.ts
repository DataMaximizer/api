import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./config/database";
import { logger } from "./config/logger";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import { authenticate, authorize } from "./middlewares/auth.middleware";
import { UserType } from "./models/user.model";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Public Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Protected Routes
app.get("/api/profile", authenticate, (req: Request, res: Response) => {
	res.json({ user: req.user });
});

// Admin Protected Routes
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
		app.listen(port, () => {
			logger.info(`Server running on port ${port}`);
		});
	} catch (error) {
		logger.error("Failed to start server:", error);
		process.exit(1);
	}
};

startServer();

export default app;
