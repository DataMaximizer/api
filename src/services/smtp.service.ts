import { SmtpProvider, ISmtpProvider } from "../models/smtp.model";
import { logger } from "../config/logger";
import nodemailer, { Transporter } from "nodemailer";

export class SmtpService {
	private static transporters: Map<string, Transporter> = new Map();

	static async initializeTransporter(
		provider: ISmtpProvider,
	): Promise<Transporter> {
		try {
			let config: any;

			console.log("chegou aqui", provider.host);

			if (
				provider.host.includes("brevo") ||
				provider.host.includes("sendinblue")
			) {
				config = {
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
					host: provider.host,
					port: provider.port,
					secure: provider.secure,
					auth: {
						user: provider.mail,
						pass: provider.password,
					},
				};
			}

			const transporter = nodemailer.createTransport(config);

			await transporter.verify();

			this.transporters.set(provider._id.toString(), transporter);
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
			const existingTransporter = this.transporters.get(providerId);

			if (!existingTransporter) {
				const provider = await SmtpProvider.findById(providerId);
				if (!provider) {
					throw new Error("SMTP provider not found");
				}
				return await this.initializeTransporter(provider);
			}

			return existingTransporter;
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
		try {
			const provider = await SmtpProvider.findById(providerId);
			if (!provider) {
				throw new Error("SMTP provider not found");
			}

			const transporter = await this.getTransporter(providerId);

			const mailOptions = {
				from: `${provider.fromName} <${provider.fromEmail}>`,
				to: Array.isArray(to) ? to.join(",") : to,
				subject,
				html,
				text,
				attachments,
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
		try {
			const provider = await SmtpProvider.findById(providerId);
			if (!provider) {
				throw new Error("SMTP provider not found");
			}

			await this.initializeTransporter(provider);
			return true;
		} catch (error: any) {
			logger.error("SMTP connection test failed:", error);
			return false;
		}
	}

	static async rotateSmtpProvider(
		userId: string,
	): Promise<ISmtpProvider | null> {
		try {
			const providers = await SmtpProvider.find({ userId });

			const provider = providers[Math.floor(Math.random() * providers.length)];

			return provider;
		} catch (error) {
			logger.error("Failed to rotate SMTP provider:", error);
			return null;
		}
	}
}
