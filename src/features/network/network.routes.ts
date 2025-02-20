import express from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { NetworkController } from "./network.controller";

const router = express.Router();

router.get("/", authenticate, NetworkController.getNetworks);
router.post("/", authenticate, NetworkController.createNetwork);
router.put("/:id", authenticate, NetworkController.updateNetwork);
router.delete("/:id", authenticate, NetworkController.deleteNetwork);

export default router;
