import { Request, Response } from "express";
import { SubscriberService } from "./subscriber.service";
import { logger } from "@config/logger";
import { IUser } from "@features/user/models/user.model";
import { Form } from "@features/form/models/form.model";
import {
  Subscriber,
  ISubscriber,
} from "@features/subscriber/models/subscriber.model";
import {
  SubscriberList,
  ISubscriberList,
} from "@features/subscriber/models/subscriber-list.model";
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

      const page = parseInt(req.query.page as string) || 1; // Default to page 1
      const limit = parseInt(req.query.limit as string) || 5; // Default to 10 items per page
      const skip = (page - 1) * limit;

      const total = await Subscriber.countDocuments({ userId: req.user._id }); // Count total documents
      const subscribers = await Subscriber.find({ userId: req.user._id })
        .populate("lists", "name subscriberCount")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      res.json({
        success: true,
        data: subscribers,
        meta: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      });
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
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { listId } = req.query;
      const subscribers = await SubscriberService.exportSubscribers(
        req.user._id.toString(),
        listId as string
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
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id || !req.file) {
        res
          .status(400)
          .json({ success: false, error: "Missing user ID or file" });
        return;
      }

      const fileName = req.file.originalname.split(".")[0];
      const userId = new Types.ObjectId(req.user._id.toString());

      const listName = `Import - ${fileName} ${new Date().toISOString()}`;

      const list = await SubscriberList.create({
        name: listName,
        description: `Imported from ${req.file.originalname}`,
        userId,
        subscriberCount: 0,
        tags: ["imported"],
      });

      const fileContent = req.file.buffer.toString("utf-8");
      const rows = fileContent.split("\n").filter((row) => row.trim());
      const headers = rows[0].split(",").map((header) => header.trim());
      const mappings = JSON.parse(req.body.mappings);

      const subscribers = [];
      let importedCount = 0;
      let errorCount = 0;
      const errorDetails = [];

      for (let i = 1; i < rows.length; i++) {
        try {
          const row = rows[i].split(",").map((cell) => cell.trim());
          const subscriberData = {
            userId,
            formId: list._id, // Use list ID as form ID for imports
            lists: [list._id],
            email: "",
            status: "active" as const,
            tags: [],
            data: {},
            lastInteraction: new Date(),
            engagementScore: 0,
            metadata: {
              source: "import",
              importDate: new Date(),
            },
            metrics: {
              opens: 0,
              clicks: 0,
              conversions: 0,
              bounces: 0,
              revenue: 0,
            },
          };

          // Map fields
          for (const mapping of mappings) {
            const columnIndex = headers.indexOf(mapping.csvHeader);
            if (columnIndex === -1) continue;

            const value = row[columnIndex]?.trim();
            if (!value) continue;

            switch (mapping.mappedField) {
              case "email":
                if (value.includes("@")) {
                  subscriberData.email = value.toLowerCase();
                }
                break;
              case "tags":
                subscriberData.tags = value
                  .split(";")
                  .map((tag) => tag.trim()) as string[];
                break;
              default:
                subscriberData.data[mapping.mappedField] = value;
            }
          }

          if (!subscriberData.email) {
            throw new Error("Missing or invalid email");
          }

          subscribers.push(subscriberData);
          importedCount++;
        } catch (error) {
          errorCount++;
          errorDetails.push(
            `Row ${i + 1}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      if (subscribers.length > 0) {
        await Subscriber.create(subscribers);
        await SubscriberList.findByIdAndUpdate(list._id, {
          subscriberCount: importedCount,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          imported: importedCount,
          errors: errorCount,
          total: rows.length - 1,
          errorDetails,
          list: {
            _id: list._id,
            name: listName,
            subscriberCount: importedCount,
          },
        },
      });
    } catch (error) {
      logger.error("Error in importSubscribers:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async getSubscribersByList(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { listId } = req.params;
      const subscribers = await Subscriber.find({
        lists: { $in: [new Types.ObjectId(listId)] },
        status: "active",
      })
        .populate("lists", "name subscriberCount")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: subscribers,
      });
    } catch (error) {
      logger.error("Error in getSubscribersByList:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subscribers for the list",
      });
    }
  }
}
