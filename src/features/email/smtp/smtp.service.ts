import { MetricsTrackingService } from "@/features/metrics/metrics-tracking.service";
import { SmtpProvider, ISmtpProvider } from "./models/smtp.model";
import { logger } from "@config/logger";
import nodemailer, { Transporter } from "nodemailer";
import { Subscriber } from "@/features/subscriber/models/subscriber.model";
import {
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@getbrevo/brevo";

type BrevoSenderIp = {
  ip: string;
  domain: string;
  weight: number;
};

type BrevoSenderResponse = {
  senders: Array<{
    id: number;
    name: string;
    email: string;
    active: boolean;
    ips?: BrevoSenderIp[];
  }>;
};

export class SmtpService {
  private static transporters: Map<
    string,
    {
      transporter: Transporter;
      lastUsed: number;
    }
  > = new Map();

  private static readonly TRANSPORTER_TIMEOUT = 30 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL = 15 * 60 * 1000;
  private static readonly POOL_CONFIG = {
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
  };

  static initCleanupInterval(): void {
    setInterval(() => {
      SmtpService.cleanupUnusedTransporters();
    }, SmtpService.CLEANUP_INTERVAL);
  }

  private static async cleanupUnusedTransporters(): Promise<void> {
    const now = Date.now();
    const transporterEntries = Array.from(SmtpService.transporters.entries());

    for (const [id, { transporter, lastUsed }] of transporterEntries) {
      if (now - lastUsed > SmtpService.TRANSPORTER_TIMEOUT) {
        try {
          transporter.close();
          SmtpService.transporters.delete(id);
          logger.info(`Closed inactive SMTP transporter for provider ${id}`);
        } catch (error) {
          logger.error(
            `Error closing SMTP transporter for provider ${id}:`,
            error
          );
        }
      }
    }
  }

  static async initializeTransporter(
    provider: ISmtpProvider
  ): Promise<Transporter> {
    try {
      let config: any;

      if (
        provider.host.includes("brevo") ||
        provider.host.includes("sendinblue")
      ) {
        config = {
          ...this.POOL_CONFIG,
          host: "smtp-relay.brevo.com",
          port: 587,
          secure: false,
          auth: {
            user: provider.mail,
            pass: provider.password,
          },
          tls: {
            ciphers: "SSLv3",
            rejectUnauthorized: false,
          },
        };
      } else {
        config = {
          ...this.POOL_CONFIG,
          host: provider.host,
          port: provider.port,
          secure: provider.secure,
          auth: {
            user: provider.mail,
            pass: provider.password,
          },
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        };
      }

      const transporter = nodemailer.createTransport(config);
      const isValid = await transporter.verify();

      if (!isValid) {
        throw new Error("Transporter verification failed");
      }

      SmtpService.transporters.set(provider._id.toString(), {
        transporter,
        lastUsed: Date.now(),
      });

      return transporter;
    } catch (error: any) {
      logger.error(
        `Failed to initialize SMTP transporter for provider ${provider.name}:`,
        error
      );
      throw new Error(`SMTP Configuration Error: ${error.message}`);
    }
  }

  static async getTransporter(providerId: string): Promise<Transporter> {
    try {
      const existingTransporter = SmtpService.transporters.get(providerId);

      if (existingTransporter) {
        existingTransporter.lastUsed = Date.now();
        return existingTransporter.transporter;
      }

      const provider = await SmtpProvider.findById(providerId);
      if (!provider) {
        throw new Error("SMTP provider not found");
      }

      return this.initializeTransporter(provider);
    } catch (error: any) {
      logger.error(
        `Failed to get transporter for provider ${providerId}:`,
        error
      );
      throw error;
    }
  }

  static async sendEmail({
    providerId,
    to,
    subject,
    html,
    text,
    senderName,
    senderEmail,
    attachments = [],
  }: {
    providerId: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: any[];
    senderName?: string;
    senderEmail?: string;
  }) {
    try {
      const provider = await SmtpProvider.findById(providerId);
      if (!provider) {
        throw new Error("SMTP provider not found");
      }

      // Use Brevo API if provider has brevoApiKey, otherwise use SMTP
      if (provider.brevoApiKey) {
        return this.sendEmailViaBrevoApi({
          provider,
          to,
          subject,
          html,
          text,
          senderName,
          senderEmail,
          attachments,
        });
      } else {
        return this.sendEmailViaSmtp({
          provider,
          to,
          subject,
          html,
          text,
          senderName,
          senderEmail,
          attachments,
        });
      }
    } catch (error: any) {
      logger.error("Failed to send email:", error);
      throw error;
    }
  }

  private static async sendEmailViaBrevoApi({
    provider,
    to,
    subject,
    html,
    text,
    senderName,
    senderEmail,
    attachments = [],
  }: {
    provider: ISmtpProvider;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: any[];
    senderName?: string;
    senderEmail?: string;
  }) {
    try {
      const brevoApi = new TransactionalEmailsApi();
      brevoApi.setApiKey(
        TransactionalEmailsApiApiKeys.apiKey,
        provider.brevoApiKey || (process.env.BREVO_API_KEY as string)
      );

      const sendSmtpEmail = {
        sender: {
          name: senderName || provider.fromName,
          email: senderEmail || provider.fromEmail,
        },
        to: Array.isArray(to)
          ? to.map((email) => ({ email }))
          : [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
        headers: {
          "X-Priority": "1",
          "X-MSMail-Priority": "High",
          Importance: "high",
        },
      };

      const result = await brevoApi.sendTransacEmail(sendSmtpEmail);
      logger.info("Email sent successfully via Brevo API", {
        body: result.body,
      });

      return result;
    } catch (error: any) {
      // Handle bounces using Brevo's error response
      if (
        error.response?.body?.code === "invalid_parameter" &&
        error.response?.body?.message?.includes("blocked")
      ) {
        const subscriber = await Subscriber.findOne({
          email: Array.isArray(to) ? to[0] : to,
        });

        if (subscriber) {
          await MetricsTrackingService.trackBounce(
            subscriber._id as string,
            "hard", // Brevo typically blocks hard bounces
            error.response.body.message,
            new Date()
          );
        }
      }

      logger.error(
        "Failed to send email via Brevo API:",
        error?.response?.body || error
      );
      throw error;
    }
  }

  private static async sendEmailViaSmtp({
    provider,
    to,
    subject,
    html,
    text,
    senderName,
    senderEmail,
    attachments = [],
  }: {
    provider: ISmtpProvider;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: any[];
    senderName?: string;
    senderEmail?: string;
  }) {
    let transporter: Transporter | null = null;
    try {
      transporter = await this.getTransporter(provider._id.toString());

      // Add bounce handling
      transporter.on("error", async (error) => {
        if (this.isBounceError(error)) {
          const subscriber = await Subscriber.findOne({
            email: Array.isArray(to) ? to[0] : to,
          });

          if (subscriber) {
            await MetricsTrackingService.trackBounce(
              subscriber._id as string,
              this.getBounceType(error),
              error.message,
              new Date()
            );
          }
        }
      });

      const mailOptions = {
        from:
          senderName && senderEmail
            ? `${senderName} <${senderEmail}>`
            : `${provider.fromName} <${provider.fromEmail}>`,
        to: Array.isArray(to) ? to.join(",") : to,
        subject,
        html,
        text,
        attachments,
        headers: {
          "X-Priority": "1",
          "X-MSMail-Priority": "High",
          Importance: "high",
        },
      };

      const result = await transporter.sendMail(mailOptions);
      logger.info("Email sent successfully via SMTP", {
        messageId: result.messageId,
      });
      return result;
    } catch (error: any) {
      // Handle immediate bounces
      if (this.isBounceError(error)) {
        const subscriber = await Subscriber.findOne({
          email: Array.isArray(to) ? to[0] : to,
        });

        if (subscriber) {
          await MetricsTrackingService.trackBounce(
            subscriber._id as string,
            this.getBounceType(error),
            error.message,
            new Date()
          );
        }
      }
      logger.error("Failed to send email via SMTP:", error);
      throw error;
    }
  }

  static async testSmtpConnection(providerId: string): Promise<boolean> {
    let transporter: Transporter | null = null;
    try {
      const provider = await SmtpProvider.findById(providerId);
      if (!provider) {
        throw new Error("SMTP provider not found");
      }

      transporter = await this.initializeTransporter(provider);
      return true;
    } catch (error: any) {
      logger.error("SMTP connection test failed:", error);
      return false;
    } finally {
      if (transporter && !this.POOL_CONFIG.pool) {
        transporter.close();
      }
    }
  }

  static async getBrevoSenders(apiKey: string) {
    try {
      const response = await fetch("https://api.brevo.com/v3/senders", {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as BrevoSenderResponse;

      return data.senders
        .filter((sender) => sender.active)
        .map(({ id, name, email }) => ({
          id,
          name,
          email,
        }));
    } catch (error: any) {
      logger.error("Failed to fetch Brevo senders:", error);
      throw error;
    }
  }

  private static isBounceError(error: any): boolean {
    return (
      error.message?.includes("bounce") ||
      error.message?.includes("rejected") ||
      error.message?.includes("blocked") ||
      error.message?.includes("invalid recipient") ||
      error.message?.includes("does not exist")
    );
  }

  private static getBounceType(error: any): "soft" | "hard" {
    const message = error.message?.toLowerCase() || "";

    // Hard bounce indicators
    if (
      message.includes("does not exist") ||
      message.includes("invalid recipient") ||
      message.includes("permanent") ||
      message.includes("hard bounce")
    ) {
      return "hard";
    }

    // Default to soft bounce
    return "soft";
  }
}

SmtpService.initCleanupInterval();
