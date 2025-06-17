import { z } from "zod";

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  params: z.record(z.any()),
  next: z.string().optional(),
  branches: z
    .object({
      true: z.string(),
      false: z.string(),
    })
    .optional(),
});

export const createAutomationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  isEnabled: z.boolean().optional(),
  trigger: z.object({
    id: z.string(),
    type: z.string(), // This will be the human-readable type, e.g., "New Lead"
    params: z.record(z.any()),
  }),
  nodes: z.array(nodeSchema),
  editorData: z.record(z.any()).optional(),
});

export const updateAutomationSchema = createAutomationSchema.partial();
