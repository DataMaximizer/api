import { SmtpProvider, ISmtpProvider } from "./models/smtp.model";
import { logger } from "@config/logger";
import nodemailer, { Transporter } from "nodemailer";

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
            error,
          );
        }
      }
    }
  }

  static async initializeTransporter(
    provider: ISmtpProvider,
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
        error,
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
        error,
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
    attachments = [],
  }: {
    providerId: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: any[];
  }) {
    let transporter: Transporter | null = null;
    try {
      const provider = await SmtpProvider.findById(providerId);
      if (!provider) {
        throw new Error("SMTP provider not found");
      }

      transporter = await this.getTransporter(providerId);

      const mailOptions = {
        from: `${provider.fromName} <${provider.fromEmail}>`,
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
      logger.info("Email sent successfully", { messageId: result.messageId });
      return result;
    } catch (error: any) {
      logger.error("Failed to send email:", error);
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

  static async rotateSmtpProvider(
    userId: string,
  ): Promise<ISmtpProvider | null> {
    try {
      const providers = await SmtpProvider.find({
        userId,
        deletedAt: null,
      }).select("-password");

      if (!providers.length) {
        return null;
      }

      const provider = providers[Math.floor(Math.random() * providers.length)];
      return provider;
    } catch (error) {
      logger.error("Failed to rotate SMTP provider:", error);
      return null;
    }
  }
}

SmtpService.initCleanupInterval();
