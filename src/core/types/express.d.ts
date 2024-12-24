import { IUser } from "@features/auth/models/user.model";

declare global {
	namespace Express {
		interface Request {
			user?: IUser;
		}
	}
}
