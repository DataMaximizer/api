import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, UserType } from "@features/auth/models/user.model";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface JwtPayload {
  userId: string;
  type: UserType;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new Error("No token provided");
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new Error("User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication required" });
  }
};

export const authorizeAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || ![UserType.OWNER, UserType.ADMIN].includes(req.user.type)) {
    res.status(403).json({ error: "Forbidden - Admin access required" });
    return;
  }
  next();
};

export const authorizeOwner = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.type !== UserType.OWNER) {
    res.status(403).json({ error: "Forbidden - Owner access required" });
    return;
  }
  next();
};

export const authorize = (allowedTypes: UserType[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedTypes.includes(req.user.type)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
};
