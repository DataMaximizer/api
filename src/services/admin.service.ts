import jwt from "jsonwebtoken";
import { User, UserType } from "../models/user.model";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "8h";

export class AdminService {
	static async login(email: string, password: string) {
		const user = await User.findOne({
			email,
			type: UserType.OWNER,
			deletedAt: null,
		});

		if (!user) {
			throw new Error("Invalid credentials");
		}

		const isValidPassword = await user.comparePassword(password);

		if (!isValidPassword) {
			throw new Error("Invalid credentials");
		}

		const token = jwt.sign(
			{
				userId: user._id,
				type: user.type,
				name: user.name,
				email: user.email,
			},
			JWT_SECRET,
			{ expiresIn: JWT_EXPIRES_IN },
		);

		return {
			user: {
				id: user._id,
				name: user.name,
				email: user.email,
				type: user.type,
			},
			token,
		};
	}
}
