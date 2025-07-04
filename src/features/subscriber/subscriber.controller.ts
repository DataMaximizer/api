import { Request, Response } from "express";
import { SubscriberService } from "./subscriber.service";
import { logger } from "@config/logger";
import { IUser, User } from "@features/user/models/user.model";
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
import { eventBus, EventType } from "@core/events/event-bus";

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
        formId: new Types.ObjectId(formId as string),
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
          interactions: [],
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
      const listId = req.body.listId;
      let list;

      // Get all blocked emails for this user
      const blockedEmails = await BlockedEmail.find({ userId }).distinct(
        "email"
      );
      const blockedEmailSet = new Set(
        blockedEmails.map((email) => email.toLowerCase())
      );

      if (listId) {
        // Use existing list
        list = await SubscriberList.findById(listId);

        if (!list || list.userId.toString() !== userId.toString()) {
          res
            .status(404)
            .json({ success: false, error: "List not found or unauthorized" });
          return;
        }
      } else {
        // Create new list
        const fileName = req.file.originalname.split(".")[0];
        const listName = `Import - ${fileName} ${new Date().toISOString()}`;

        list = await SubscriberList.create({
          name: listName,
          description: "",
          userId,
          subscriberCount: 0,
          tags: ["imported"],
        });
      }

      const fileContent = req.file.buffer.toString("utf-8");
      const rows = fileContent.split("\n").filter((row) => row.trim());
      const headers = rows[0].split(",").map((header) => header.trim());
      const mappings = JSON.parse(req.body.mappings);
      const updateExisting = req.body.updateExisting === "true";

      const subscribers = [];
      let importedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      let blockedCount = 0;
      let existingSubscribersCount = 0;
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
            data: {} as Record<string, string>,
            lastInteraction: new Date(),
            engagementScore: 0,
            phone: "",
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
              interactions: [],
            },
          };

          // Map fields
          let firstName = "";
          let lastName = "";

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
              case "phone":
                subscriberData.phone = value;
                break;
              case "firstName":
                firstName = value;
                break;
              case "lastName":
                lastName = value;
                break;
              case "name":
                subscriberData.data.name = value;
                break;
              case "gender":
                subscriberData.data.gender = value;
                break;
              case "dateOfBirth":
              case "dob":
                subscriberData.data.dateOfBirth = value;
                break;
              case "country":
              case "region":
              case "countryRegion":
                subscriberData.data.countryRegion = value;
                break;
              case "ip":
              case "ipAddress":
              case "ip_address":
                subscriberData.data.ip = value;
                break;
              case "optin":
              case "opt_in":
              case "optinVerified":
              case "optin_verified":
                subscriberData.data.optInVerified = value;
                break;
              default:
                // Handle any custom fields by adding them to the data object
                if (mapping.mappedField.startsWith("custom_")) {
                  const fieldName = mapping.mappedField.replace("custom_", "");
                  subscriberData.data[fieldName] = value;
                }
                break;
            }
          }

          // Combine first and last name if both exist
          if (firstName || lastName) {
            subscriberData.data.name = [firstName, lastName]
              .filter(Boolean)
              .join(" ");
          }

          // Also check if there's a direct "name" column in the CSV
          const nameColumnIndex = headers.indexOf("name");
          if (nameColumnIndex !== -1 && row[nameColumnIndex]?.trim()) {
            subscriberData.data.name = row[nameColumnIndex].trim();
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
        // Deduplicate subscribers array by email
        const uniqueEmailMap = new Map();
        subscribers.forEach((sub) => {
          uniqueEmailMap.set(sub.email, sub);
        });
        const deduplicatedSubscribers = Array.from(uniqueEmailMap.values());

        const existingSubscribers = await Subscriber.find({
          email: { $in: deduplicatedSubscribers.map((s) => s.email) },
        });

        existingSubscribersCount = existingSubscribers.length;

        const uniqueSubscribers = deduplicatedSubscribers.filter(
          (s) => !existingSubscribers.some((es) => es.email === s.email)
        );

        // Update existing subscribers with new data if updateExisting is true
        if (updateExisting && existingSubscribers.length > 0) {
          for (const existingSub of existingSubscribers) {
            const newData = deduplicatedSubscribers.find(
              (s) => s.email === existingSub.email
            );
            if (newData) {
              const updateFields: Record<string, any> = {};

              // Add all data fields that exist in the new data
              if (Object.keys(newData.data).length > 0) {
                for (const [key, value] of Object.entries(newData.data)) {
                  updateFields[`data.${key}`] = value;
                }
              }

              // Add phone if it exists
              if (newData.phone) {
                updateFields.phone = newData.phone;
              }

              await Subscriber.updateOne(
                { _id: existingSub._id },
                {
                  $set: updateFields,
                  $addToSet: { lists: list._id },
                }
              );
              updatedCount++;
            } else {
              // Just add to the list if no data update
              await Subscriber.updateOne(
                { _id: existingSub._id },
                { $addToSet: { lists: list._id } }
              );
            }
          }
        } else {
          // Just update the subscriber lists without changing data
          await Subscriber.updateMany(
            { _id: { $in: existingSubscribers.map((s) => s._id) } },
            { $addToSet: { lists: list._id } }
          );
        }

        // Create new subscribers
        await Subscriber.create(uniqueSubscribers);

        const subscriberCount = await Subscriber.countDocuments({
          userId,
          lists: list._id,
        });
        await SubscriberList.findByIdAndUpdate(list._id, {
          subscriberCount,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          imported: importedCount - existingSubscribersCount,
          updated: updatedCount,
          errors: errorCount,
          blocked: blockedCount,
          total: rows.length - 1,
          errorDetails,
          list: {
            _id: list._id,
            name: list.name,
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

      const { emails } = req.body;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        res.status(400).json({
          success: false,
          error: "Emails array is required",
        });
        return;
      }

      // Sanitize email inputs - trim spaces, remove trailing commas, and remove empty entries
      // Also remove initial and trailing quotes (both single and double quotes)
      const sanitizedEmails = emails
        .map((email) => {
          if (typeof email !== "string") return email;
          // Trim spaces and remove trailing commas
          let sanitized = email.trim();
          while (sanitized.endsWith(",")) {
            sanitized = sanitized.slice(0, -1).trim();
          }
          // Remove initial and trailing quotes (both single and double quotes)
          if (
            (sanitized.startsWith('"') && sanitized.endsWith('"')) ||
            (sanitized.startsWith("'") && sanitized.endsWith("'"))
          ) {
            sanitized = sanitized.slice(1, -1).trim();
          }
          return sanitized;
        })
        .filter((email) => email && email.length > 0);

      if (sanitizedEmails.length === 0) {
        res.status(400).json({
          success: false,
          error: "No valid emails provided after sanitization",
        });
        return;
      }

      const blockedEmails = await SubscriberService.blockEmail(
        req.user._id.toString(),
        sanitizedEmails
      );

      res.status(201).json({
        success: true,
        data: blockedEmails,
      });
    } catch (error) {
      logger.error("Error in blockEmail:", error);
      res.status(400).json({
        success: false,
        error: "Failed to block emails",
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

  static async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const { clickId, websiteUrl } = req.query;

      if (!clickId || !websiteUrl) {
        res.status(400).json({
          success: false,
          error: "Click ID and website URL are required",
        });
        return;
      }

      await SubscriberService.unsubscribe(clickId as string);

      res.redirect(websiteUrl as string);
    } catch (error) {
      logger.error("Error in unsubscribe:", error);
      res.status(400).json({
        success: false,
        error: "Failed to unsubscribe",
      });
    }
  }

  static async updateList(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { listId } = req.params;
      const updateData = req.body;

      const updatedList = await SubscriberService.updateList(
        listId,
        req.user._id.toString(),
        updateData
      );

      if (!updatedList) {
        res.status(404).json({ success: false, error: "List not found" });
        return;
      }

      res.json({ success: true, data: updatedList });
    } catch (error) {
      logger.error("Error in updateList:", error);
      res.status(400).json({ success: false, error: "Failed to update list" });
    }
  }

  static async deleteList(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { listId } = req.params;

      await SubscriberService.deleteList(listId, req.user._id.toString());

      res.json({
        success: true,
        message: "List deleted successfully",
      });
    } catch (error) {
      logger.error("Error in deleteList:", error);
      res.status(400).json({
        success: false,
        error: "Failed to delete list",
      });
    }
  }

  static async addWebhookSubscriber(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { uid, key, listId } = req.query;
      const { name, email, customData } = req.body;

      if (!uid || !key) {
        res.status(401).json({
          success: false,
          error: "Missing authentication parameters",
        });
        return;
      }

      // Find user by ID and verify their webhook key
      const owner = await User.findById(uid);
      const webhooks = owner?.webhooks;

      if (!webhooks || webhooks.length === 0) {
        res.status(401).json({
          success: false,
          error: "Webhooks not found",
        });
        return;
      }

      const targetWebhook = webhooks.find(
        (w) => w.type === "lead" && w.parameters.key === key
      );

      if (!targetWebhook) {
        res.status(401).json({
          success: false,
          error: "Invalid webhook key",
        });
        return;
      }

      if (!email || !name) {
        res.status(400).json({
          success: false,
          error: "Email and name are required",
        });
        return;
      }

      if (!email.includes("@")) {
        res.status(400).json({
          success: false,
          error: "Invalid email",
        });
        return;
      }

      const list = await SubscriberList.findById(listId);

      if (!list) {
        res.status(404).json({
          success: false,
          error: "List not found",
        });
        return;
      }

      const subscriberData: Partial<ISubscriber> = {
        email: email.toLowerCase(),
        userId: owner.id,
        data: { name: name || "", ...(customData || {}) },
        status: "active",
        lists: [list._id as unknown as Types.ObjectId],
        metadata: {
          source: "webhook",
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
        lastInteraction: new Date(),
        engagementScore: 0,
        tags: ["webhook"],
        metrics: {
          opens: 0,
          clicks: 0,
          conversions: 0,
          bounces: 0,
          revenue: 0,
          interactions: [],
        },
      };

      const subscriber = await SubscriberService.addWebhookSubscriber(
        subscriberData
      );

      const availableLists = await SubscriberList.find({ userId: owner.id });

      eventBus.emitEvent(EventType.NEW_LEAD, {
        subscriberId: subscriber.id,
        userId: owner.id,
        email: subscriber.email,
        lists: availableLists?.map((t) => t.id) || [],
      });

      res.status(201).json({
        success: true,
        data: subscriber,
      });
    } catch (error) {
      logger.error("Error in addWebhookSubscriber:", error);
      res.status(400).json({
        success: false,
        error: "Failed to add subscriber via webhook",
      });
    }
  }

  static async deleteSubscribers(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { subscriberIds } = req.body;

      if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Subscriber IDs array is required",
        });
        return;
      }

      await SubscriberService.deleteSubscribers(
        req.user._id.toString(),
        subscriberIds
      );

      res.json({
        success: true,
        message: "Subscribers deleted successfully",
      });
    } catch (error) {
      logger.error("Error in deleteSubscribers:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete subscribers",
      });
    }
  }
}
