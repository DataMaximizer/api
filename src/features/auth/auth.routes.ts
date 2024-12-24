import { Router } from "express";
import { AuthController } from "@features/auth/auth.controller";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { createUserSchema } from "@core/utils/validators/validations/user.validation";
import { authenticate } from "@core/middlewares/auth.middleware";
import { AuthService } from "@features/auth/auth.service";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/register",
  validateRequest(createUserSchema),
  AuthController.register,
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Login user
 *     description: Authenticate existing user and receive JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/login", AuthController.login);

router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await AuthService.refreshToken(refreshToken);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await AuthService.revokeToken(refreshToken);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(400).json({ error: "Failed to logout" });
  }
});

export default router;
