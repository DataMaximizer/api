import { Network } from "@/features/network/network.model";
import { Request, Response, NextFunction } from "express";

export class NetworkController {
  static async getNetworks(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const networks = await Network.find({ userId });
      res.json(networks);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching networks", error });
    }
  }

  static async createNetwork(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name } = req.body;
      const userId = req.user?.id;
      const network = new Network({ name, userId });
      await network.save();
      res.status(201).json(network);
    } catch (error: any) {
      if (error.code === 11000) {
        res.status(400).json({ message: "Network name already exists" });
        return;
      }
      res.status(500).json({ message: "Error creating network", error });
    }
  }

  static async updateNetwork(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const userId = req.user?.id;

      const network = await Network.findOneAndUpdate(
        { _id: id, userId },
        { name },
        { new: true, runValidators: true }
      );

      if (!network) {
        res.status(404).json({ message: "Network not found" });
        return;
      }
      res.json(network);
    } catch (error: any) {
      if (error.code === 11000) {
        res.status(400).json({ message: "Network name already exists" });
        return;
      }
      res.status(500).json({ message: "Error updating network", error });
    }
  }

  static async deleteNetwork(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const network = await Network.findOneAndDelete({ _id: id });

      if (!network) {
        res.status(404).json({ message: "Network not found" });
        return;
      }

      res.status(200).json({ message: "Network deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Error deleting network", error });
    }
  }
}
