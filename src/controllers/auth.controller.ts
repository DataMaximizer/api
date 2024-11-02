import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export class AuthController {
	static async register(req: Request, res: Response) {
		try {
			const { user, token } = await AuthService.register(req.body);
			res.status(201).json({ user, token });
		} catch (error) {
			// @ts-ignore
			res.status(400).json({ error: error.message });
		}
	}

	static async login(req: Request, res: Response) {
		try {
			const { email, password } = req.body;
			const { user, token } = await AuthService.login(email, password);
			res.json({ user, token });
		} catch (error) {
			// @ts-ignore
			res.status(401).json({ error: error.message });
		}
	}
}
