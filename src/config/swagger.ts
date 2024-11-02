import { Express } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: "API DATAMAX Documentation",
			version: "1.0.0",
			description: "API documentation for the Node.js TypeScript DATAMAX API",
			license: {
				name: "MIT",
				url: "https://spdx.org/licenses/MIT.html",
			},
			contact: {
				name: "API Support",
				email: "support@example.com",
			},
		},
		servers: [
			{
				url: "http://localhost:3000",
				description: "Development server",
			},
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
			schemas: {
				User: {
					type: "object",
					required: [
						"type",
						"name",
						"email",
						"phone",
						"document",
						"bornAt",
						"address",
						"sex",
					],
					properties: {
						type: {
							type: "string",
							enum: ["owner", "customer", "employee"],
						},
						name: {
							type: "string",
							minLength: 2,
						},
						email: {
							type: "string",
							format: "email",
						},
						phone: {
							type: "string",
							minLength: 10,
						},
						document: {
							type: "string",
						},
						bornAt: {
							type: "string",
							format: "date",
						},
						address: {
							type: "object",
							properties: {
								line1: { type: "string" },
								line2: { type: "string" },
								line3: { type: "string" },
								postalCode: { type: "string" },
								neighborhood: { type: "string" },
								state: { type: "string", minLength: 2, maxLength: 2 },
							},
							required: ["line1", "postalCode", "neighborhood", "state"],
						},
						sex: {
							type: "number",
							enum: [1, 2],
						},
						avatar: {
							type: "string",
						},
						configuration: {
							type: "object",
							properties: {
								position: {
									type: "array",
									items: {
										type: "string",
										enum: ["service-provider", "administration"],
									},
								},
								shift: {
									type: "object",
									properties: {
										start: { type: "string" },
										end: { type: "string" },
									},
								},
								lunch: {
									type: "object",
									properties: {
										start: { type: "string" },
										end: { type: "string" },
									},
								},
								services: {
									type: "array",
									items: { type: "string" },
								},
							},
						},
					},
				},
				Error: {
					type: "object",
					properties: {
						error: {
							type: "string",
						},
					},
				},
			},
		},
	},
	apis: ["./src/routes/*.ts"], // Path to the API routes
};

export function setupSwagger(app: Express): void {
	const specs = swaggerJsdoc(options);
	app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
}
