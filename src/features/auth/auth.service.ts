import jwt from "jsonwebtoken";
import { User, IUser, UserType } from "@features/user/models/user.model";
import { v4 as uuidv4 } from "uuid";
import { RefreshToken } from "@features/auth/models/refresh-token.model";
import { VerificationToken } from "@features/auth/models/verification-token.model";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { SmtpProvider } from "@features/email/smtp/models/smtp.model";
import crypto from "crypto";
import { Schema, Types } from "mongoose";
import { UserService } from "../user/user.service";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "1d";
const VERIFICATION_TOKEN_EXPIRES_IN = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60 * 1000; // 30 days
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export class AuthService {
  static async register(userData: Partial<IUser>) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error("Email already registered");
    }

    // Create user without password and mark as inactive
    const user = await User.create({
      ...userData,
      type: UserType.CUSTOMER,
      isActive: false,
      password: "",
    });

    // Generate activation token
    const verificationToken = await this.generateVerificationToken(
      user._id as Types.ObjectId,
      "account_activation"
    );

    // Send activation email
    await this.sendActivationEmail(user, verificationToken);

    return { user };
  }

  static async activateAccount(token: string, password: string) {
    // Find the verification token
    const verificationToken = await VerificationToken.findOne({
      token,
      type: "account_activation",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!verificationToken) {
      throw new Error("Invalid or expired token");
    }

    // Find the user
    const user = await User.findById(verificationToken.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Set password and activate account
    user.password = password;
    user.isActive = true;
    await user.save();

    // Mark token as used
    verificationToken.isUsed = true;
    await verificationToken.save();

    // Generate authentication tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { user, accessToken, refreshToken };
  }

  static async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error(
        "Account not activated. Please check your email for the activation link"
      );
    }

    // Check password
    if (!(await user.comparePassword(password))) {
      throw new Error("Invalid credentials");
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);
    return { user, accessToken, refreshToken };
  }

  static async refreshToken(token: string) {
    const refreshTokenDoc = await RefreshToken.findOne({
      token,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!refreshTokenDoc) {
      throw new Error("Invalid refresh token");
    }

    const user = await User.findById(refreshTokenDoc.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("Account not activated");
    }

    refreshTokenDoc.isRevoked = true;
    await refreshTokenDoc.save();

    return this.generateTokens(user);
  }

  static async revokeToken(token: string) {
    const refreshToken = await RefreshToken.findOne({ token });
    if (refreshToken) {
      refreshToken.isRevoked = true;
      await refreshToken.save();
    }
  }

  static async generateVerificationToken(
    userId: Types.ObjectId,
    type: "account_activation" | "password_reset"
  ) {
    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");

    // Create and save the verification token
    const verificationToken = await VerificationToken.create({
      userId,
      token,
      type,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_IN),
    });

    return verificationToken.token;
  }

  static async sendActivationEmail(user: IUser, token: string) {
    try {
      // Find a default SMTP provider
      const adminUser = await UserService.getAdminUser();
      const smtpProvider = await SmtpProvider.findOne({
        userId: adminUser._id,
      });

      if (!smtpProvider) {
        throw new Error("No SMTP provider configured");
      }

      const activationLink = `${APP_URL}/activate-account?token=${token}`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Welcome to Inbox Engine!</h2>
          <p>Hello ${user.name},</p>
          <p>Thank you for registering. To complete your registration and activate your account, please click the button below:</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${activationLink}" style="background-color: #3498db; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Activate Account</a>
          </div>
          
          <p>Or copy and paste this link in your browser:</p>
          <p><a href="${activationLink}">${activationLink}</a></p>
          
          <p>This link will expire in 24 hours.</p>
          
          <p>If you did not register on our platform, please ignore this email.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `;

      const adminProvider = await SmtpService.getAdminProvider();
      if (!adminProvider) {
        throw new Error("Admin provider not found");
      }

      await SmtpService.sendEmail({
        providerId: adminProvider._id.toString(),
        to: user.email,
        subject: "Activate Your Account",
        html: htmlContent,
        senderName: "Inbox Engine",
        senderEmail: adminProvider.fromEmail,
      });

      return true;
    } catch (error) {
      console.error("Error sending activation email:", error);
      throw new Error("Failed to send activation email");
    }
  }

  private static async generateTokens(user: IUser) {
    const accessToken = jwt.sign(
      { userId: user._id, role: user.type },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
      }
    );

    const refreshToken = uuidv4();
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
    });

    return { accessToken, refreshToken };
  }
}
