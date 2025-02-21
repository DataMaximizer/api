import { z } from "zod";
import { UserSex } from "@features/user/models/user.model";

export const updateProfileSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  document: z.string().optional(),
  bornAt: z.string().or(z.date()).optional(),
  sex: z.nativeEnum(UserSex).optional(),
  companyName: z.string(),
  companyUrl: z.string(),
  address: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    postalCode: z.string(),
    neighborhood: z.string().optional(),
    state: z.string(),
    city: z.string(),
    country: z.string(),
  }),
  configuration: z
    .object({
      position: z.array(z.string()).optional(),
      shift: z
        .object({
          start: z.string().optional(),
          end: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
