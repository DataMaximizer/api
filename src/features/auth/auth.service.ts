import jwt from "jsonwebtoken";
import { User, IUser, UserType } from "@features/user/models/user.model";
import { v4 as uuidv4 } from "uuid";
import { RefreshToken } from "@features/auth/models/refresh-token.model";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "1d";

const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthService {
  static async register(userData: Partial<IUser>) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error("Email already registered");
    }

    const user = await User.create({ ...userData, type: UserType.ADMIN });
    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { user, accessToken, refreshToken };
  }

  static async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
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
