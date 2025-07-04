import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./config/database";
import { logger } from "./config/logger";
import { setupSwagger } from "./config/swagger";
import { authenticate, authorize } from "@core/middlewares/auth.middleware";
import { UserType } from "@features/user/models/user.model";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";

require("dotenv").config();

import {
  authRoutes,
  smtpRoutes,
  adminRoutes,
  trackingRoutes,
  campaignRoutes,
  affiliateRoutes,
  formRoutes,
  subscriberRoutes,
  profileRoutes,
  metricsRoutes,
  automatedEmailRoutes,
  aiConfigRoutes,
  redirectRoutes,
  analyticsRoutes,
  promptRoutes,
  automationRoutes,
} from "./routes";

import { SchedulerService } from "@features/shared/services/scheduler.service";
import { scheduledTaskService } from "@features/ai/services/scheduled-task.service";
import swaggerJSDoc from "swagger-jsdoc";
import { CacheService } from "@core/services/cache.service";
import { userRouter } from "./features/user/user.routes";
import contentTemplateRoutes from "@features/email/templates/content-template.routes";
import networkRoutes from "./features/network/network.routes";
import emailOptimizationRoutes from "./features/ai/routes/email-optimization.routes";
import emailTemplateRoutes from "@features/email/templates/email-template.routes";
import { automationEngine } from "@features/automation/services/automation-engine.service";
import { workflowSchedulerService } from "@features/automation/services/workflow-scheduler.service";

const app = express();
const port = process.env.PORT || 5000;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })
);

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
        url: `http://localhost:${process.env.PORT}`,
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
app.use(express.json({ limit: "10mb" }));

setupSwagger(app);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/smtp", smtpRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/subscribers", subscriberRoutes);
app.use("/api/metrics/track", trackingRoutes);
app.use("/api/automated-email", automatedEmailRoutes);
app.use("/api/email/templates", emailTemplateRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/profile", profileRoutes);
app.use("/api/ai", aiConfigRoutes);
app.use("/api/networks", networkRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai/email-optimization", emailOptimizationRoutes);
app.use("/api/prompts", promptRoutes);
app.use("/api/automations", automationRoutes);

app.get(
  "/api/admin/dashboard",
  authenticate,
  authorize([UserType.OWNER]),
  (req: Request, res: Response) => {
    res.json({ message: "Admin access granted" });
  }
);

app.use("/api/users", userRouter);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Error:", err);
  res.status(500).json({ error: err.message });
});

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    //await CacheService.initialize();

    // Initialize core singleton services
    automationEngine.initialize();
    workflowSchedulerService.initialize();
    SchedulerService.initializeScheduledTasks();

    // Initialize the email optimization scheduled task service
    scheduledTaskService.initialize();
    logger.info("Email optimization scheduled task service initialized");

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(
        `Swagger documentation available at http://localhost:${port}/api-docs`
      );
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  await CacheService.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received. Shutting down gracefully...");
  await CacheService.disconnect();
  process.exit(0);
});

startServer();

export default app;
