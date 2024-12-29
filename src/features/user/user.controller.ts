import { Request, Response } from "express";
import { UserService } from "./user.service";
import { UpdateUserInput } from "./models/user.model";

class UserController {
  async listUsers(req: Request, res: Response) {
    try {
      const { type } = req.query;
      const filter = type ? { type } : {};
      const users = await UserService.getUsers(filter);
      return res.status(200).json(users);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await UserService.getUserById(id);
      return res.status(200).json(user);
    } catch (error: any) {
      if (error.message === "User not found") {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  }

  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const input: UpdateUserInput = req.body;
      const user = await UserService.updateUser(id, input);
      return res.status(200).json(user);
    } catch (error: any) {
      if (error.message === "User not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Email or document already exists") {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await UserService.deleteUser(id);
      return res.status(200).json(user);
    } catch (error: any) {
      if (error.message === "User not found") {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  }
}

export const userController = new UserController();
