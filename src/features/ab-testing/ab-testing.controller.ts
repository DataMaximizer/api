import { Request, Response, NextFunction } from "express";
import { AbTestingService } from "./ab-testing.service";
import { AbTest, TestType } from "./models/ab-testing.model";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";

interface AuthRequest extends Request {
  user?: IUser;
}

export class AbTestingController {
  static async createTest(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const testData = {
        ...req.body,
        userId: req.user?._id,
      };

      const test = await AbTestingService.createTest(testData);

      res.status(201).json({
        success: true,
        data: test,
      });
    } catch (error) {
      logger.error("Error creating A/B test:", error);
      next(error);
    }
  }

  static async getTests(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { campaignId, status, type, page = 1, limit = 10 } = req.query;
      const query: any = { userId: req.user?._id };

      if (campaignId) query.campaignId = campaignId;
      if (status) query.status = status;
      if (type) query.type = type;

      const tests = await AbTest.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("campaignId", "name");

      const total = await AbTest.countDocuments(query);

      res.json({
        success: true,
        data: tests,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      logger.error("Error fetching A/B tests:", error);
      next(error);
    }
  }

  static async getTestById(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const test = await AbTest.findOne({
        _id: req.params.id,
        userId: req.user?._id,
      }).populate("campaignId", "name");

      if (!test) {
        res.status(404).json({
          success: false,
          error: "Test not found",
        });
        return;
      }

      res.json({
        success: true,
        data: test,
      });
    } catch (error) {
      logger.error("Error fetching A/B test:", error);
      next(error);
    }
  }

  static async startTest(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const test = await AbTestingService.startTest(req.params.id);

      res.json({
        success: true,
        data: test,
      });
    } catch (error) {
      logger.error("Error starting A/B test:", error);
      next(error);
    }
  }

  static async pauseTest(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const test = await AbTestingService.pauseTest(req.params.id);

      res.json({
        success: true,
        data: test,
      });
    } catch (error) {
      logger.error("Error pausing A/B test:", error);
      next(error);
    }
  }

  static async getTestResults(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const results = await AbTestingService.getTestResults(req.params.id);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error("Error getting test results:", error);
      next(error);
    }
  }

  static async trackConversion(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { testId, variantId } = req.params;
      const metrics = req.body;

      await AbTestingService.trackConversion(testId, variantId, metrics);

      res.json({
        success: true,
        message: "Conversion tracked successfully",
      });
    } catch (error) {
      logger.error("Error tracking conversion:", error);
      next(error);
    }
  }
}
