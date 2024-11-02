import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./config/database";
import { logger } from "./config/logger";
import { setupSwagger } from "./config/swagger";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import { authenticate, authorize } from "./middlewares/auth.middleware";
import { UserType } from "./models/user.model";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup Swagger
setupSwagger(app);

// Public Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Protected Routes
/**
 * @openapi
 * /api/profile:
 *   get:
 *     tags:
 *       - User
 *     summary: Get user profile
 *     description: Retrieve the profile of the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/api/profile", authenticate, (req: Request, res: Response) => {
	res.json({ user: req.user });
});

// Admin Protected Routes
/**
 * @openapi
 * /api/admin/dashboard:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get admin dashboard
 *     description: Retrieve admin dashboard data (owner access only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *       403:
 *         description: Forbidden - Not an admin
 *       401:
 *         description: Unauthorized
 */
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
