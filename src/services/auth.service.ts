import jwt from "jsonwebtoken";
import { User, IUser } from "../models/user.model";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "1d";

export class AuthService {
	static async register(userData: Partial<IUser>) {
		const existingUser = await User.findOne({ email: userData.email });
		if (existingUser) {
			throw new Error("Email already registered");
		}

		const user = await User.create(userData);
		const token = this.generateToken(user);

		return { user, token };
	}

	static async login(email: string, password: string) {
		const user = await User.findOne({ email });
		if (!user || !(await user.comparePassword(password))) {
			throw new Error("Invalid credentials");
		}

		const token = this.generateToken(user);
		return { user, token };
	}

	private static generateToken(user: IUser) {
		return jwt.sign({ userId: user._id, role: user.type }, JWT_SECRET, {
			expiresIn: JWT_EXPIRES_IN,
		});
	}
}
