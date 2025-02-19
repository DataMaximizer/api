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
import { BlockedEmail } from "./models/blocked-email.model";

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

      // Get blocked emails for this user
      const blockedEmails = await BlockedEmail.find({
        userId: req.user._id,
      }).distinct("email");

      const subscribers = await Subscriber.find({
        userId: req.user._id,
        email: { $nin: blockedEmails },
      })
        .populate("lists", "name subscriberCount")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: subscribers,
      });
    } catch (error) {
      logger.error("Error in getSubscribers:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subscribers",
      });
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

      // Check if email is blocked
      const isBlocked = await BlockedEmail.findOne({
        userId: new Types.ObjectId(req.user?._id as string),
        email: email.toLowerCase(),
      });

      if (isBlocked) {
        res.status(400).json({
          success: false,
          error: "This email address has been blocked",
        });
        return;
      }

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
        formId,
        userId: new Types.ObjectId(req.user?._id as string),
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

      const userId = new Types.ObjectId(req.user._id.toString());

      // Get all blocked emails for this user
      const blockedEmails = await BlockedEmail.find({ userId }).distinct(
        "email"
      );
      const blockedEmailSet = new Set(
        blockedEmails.map((email) => email.toLowerCase())
      );

      const fileName = req.file.originalname.split(".")[0];
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
      let blockedCount = 0;
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
            }
          }

          if (!subscriberData.email) {
            throw new Error("Missing or invalid email");
          }

          // Check if email is blocked
          if (blockedEmailSet.has(subscriberData.email)) {
            blockedCount++;
            errorDetails.push(`Row ${i + 1}: Email is blocked`);
            continue;
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
        const existingSubscribers = await Subscriber.find({
          email: { $in: subscribers.map((s) => s.email) },
        });

        const uniqueSubscribers = subscribers.filter(
          (s) => !existingSubscribers.some((es) => es.email === s.email)
        );

        // update the subscriber lists
        await Subscriber.updateMany(
          { _id: { $in: existingSubscribers.map((s) => s._id) } },
          { $addToSet: { lists: list.id } }
        );

        await Subscriber.create(uniqueSubscribers);
        await SubscriberList.findByIdAndUpdate(list._id, {
          subscriberCount: importedCount,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          imported: importedCount,
          errors: errorCount,
          blocked: blockedCount,
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

      const blockedEmails = await BlockedEmail.find({
        userId: req.user._id,
      }).distinct("email");

      const subscribers = await Subscriber.find({
        lists: { $in: [new Types.ObjectId(listId)] },
        status: "active",
        email: { $nin: blockedEmails },
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

  static async blockEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: "Email is required",
        });
        return;
      }

      const blockedEmail = await SubscriberService.blockEmail(
        req.user._id.toString(),
        email
      );

      res.status(201).json({
        success: true,
        data: blockedEmail,
      });
    } catch (error) {
      logger.error("Error in blockEmail:", error);
      res.status(400).json({
        success: false,
        error: "Failed to block email",
      });
    }
  }

  static async getBlockedEmails(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const blockedEmails = await SubscriberService.getBlockedEmails(
        req.user._id.toString()
      );

      res.json({
        success: true,
        data: blockedEmails,
      });
    } catch (error) {
      logger.error("Error in getBlockedEmails:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch blocked emails",
      });
    }
  }

  static async unblockEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: "Id is required",
        });
        return;
      }

      await SubscriberService.unblockEmail(id);

      res.status(200).json({
        success: true,
        message: "Email unblocked successfully",
      });
    } catch (error) {
      logger.error("Error in unblockEmail:", error);
      res.status(400).json({
        success: false,
        error: "Failed to unblock email",
      });
    }
  }
}
