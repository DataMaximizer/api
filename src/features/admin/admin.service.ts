import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { User, UserType } from "@features/auth/models/user.model";
import { RefreshToken } from "@features/auth/models/refresh-token.model";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "8h";
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AdminService {
  static async login(email: string, password: string) {
    const user = await User.findOne({ email, type: UserType.OWNER });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    const accessToken = jwt.sign(
      { userId: user._id, role: user.type },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
      },
    );

    const refreshToken = uuidv4();
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        type: user.type,
      },
      accessToken,
      refreshToken,
    };
  }
}
