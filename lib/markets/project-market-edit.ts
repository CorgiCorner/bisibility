import { z } from "zod";

const projectIdSchema = z.string().trim().min(1).max(120);
export const projectMarketIdSchema = z
  .string()
  .regex(/^pmkt_[a-z][a-z0-9]{23}$/, "Project market ID is invalid.");

export const futureKeywordDevicesSchema = z
  .array(z.enum(["desktop", "mobile"]))
  .min(1)
  .max(2)
  .refine((devices) => new Set(devices).size === devices.length, "Default devices must be unique.");

export const projectMarketActionSchema = z.object({
  marketId: projectMarketIdSchema,
  projectId: projectIdSchema,
});

export const projectMarketEditSchema = projectMarketActionSchema.extend({
  futureKeywordDevices: futureKeywordDevicesSchema,
  locationId: projectIdSchema.optional(),
  name: z.string().trim().min(1, "Market name is required.").max(120),
});

export type ProjectMarketEditInput = z.infer<typeof projectMarketEditSchema>;
