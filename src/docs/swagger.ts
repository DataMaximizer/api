/**
 * @swagger
 * components:
 *   schemas:
 *     SmtpProvider:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         host:
 *           type: string
 *         port:
 *           type: number
 *         secure:
 *           type: boolean
 *         fromEmail:
 *           type: string
 *         fromName:
 *           type: string
 *         mail:
 *           type: string
 *         password:
 *           type: string
 *     Form:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         fields:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               label:
 *                 type: string
 *               type:
 *                 type: string
 *               required:
 *                 type: boolean
 *     AffiliateOffer:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         url:
 *           type: string
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *         commissionRate:
 *           type: number
 *     Subscriber:
 *       type: object
 *       properties:
 *         email:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, unsubscribed, bounced]
 *         data:
 *           type: object
 *     Campaign:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         type:
 *           type: string
 *           enum: [email, sms]
 *         status:
 *           type: string
 *           enum: [draft, scheduled, running, completed, paused]
 *     AIConfig:
 *       type: object
 *       properties:
 *         provider:
 *           type: string
 *           enum: [openai, anthropic]
 *         model:
 *           type: string
 *         apiKey:
 *           type: string
 *         temperature:
 *           type: number
 *
 * /api/smtp/providers:
 *   post:
 *     tags:
 *       - SMTP
 *     summary: Create SMTP provider
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SmtpProvider'
 *     responses:
 *       201:
 *         description: SMTP provider created
 *   get:
 *     tags:
 *       - SMTP
 *     summary: Get all SMTP providers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of SMTP providers
 *
 * /api/forms:
 *   post:
 *     tags:
 *       - Forms
 *     summary: Create form
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Form'
 *     responses:
 *       201:
 *         description: Form created
 *   get:
 *     tags:
 *       - Forms
 *     summary: Get all forms
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of forms
 *
 * /api/affiliate/offers:
 *   post:
 *     tags:
 *       - Affiliate
 *     summary: Create affiliate offer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AffiliateOffer'
 *     responses:
 *       201:
 *         description: Affiliate offer created
 *   get:
 *     tags:
 *       - Affiliate
 *     summary: Get all affiliate offers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of affiliate offers
 *
 * /api/subscribers:
 *   post:
 *     tags:
 *       - Subscribers
 *     summary: Add subscriber
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Subscriber'
 *     responses:
 *       201:
 *         description: Subscriber added
 *   get:
 *     tags:
 *       - Subscribers
 *     summary: Get all subscribers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of subscribers
 *
 * /api/campaigns:
 *   post:
 *     tags:
 *       - Campaigns
 *     summary: Create campaign
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Campaign'
 *     responses:
 *       201:
 *         description: Campaign created
 *   get:
 *     tags:
 *       - Campaigns
 *     summary: Get all campaigns
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of campaigns
 *
 * /api/settings/ai-config:
 *   post:
 *     tags:
 *       - Settings
 *     summary: Update AI configuration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AIConfig'
 *     responses:
 *       200:
 *         description: AI configuration updated
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get AI configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI configuration
 */
