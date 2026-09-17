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

export type ProjectMarketEditValidationMessages = {
  nameRequired: string;
  nameTooLong: string;
};

function projectMarketNameSchema(messages?: ProjectMarketEditValidationMessages) {
  return messages
    ? z.string().trim().min(1, messages.nameRequired).max(120, messages.nameTooLong)
    : z.string().trim().min(1, "Market name is required.").max(120);
}

export const projectMarketEditSchema = projectMarketActionSchema.extend({
  futureKeywordDevices: futureKeywordDevicesSchema,
  locationId: projectIdSchema.optional(),
  name: projectMarketNameSchema(),
});

/** Builds a localized form projection without changing update action validation. */
export function projectMarketEditSchemaFor(messages: ProjectMarketEditValidationMessages) {
  return projectMarketActionSchema.extend({
    futureKeywordDevices: futureKeywordDevicesSchema,
    locationId: projectIdSchema.optional(),
    name: projectMarketNameSchema(messages),
  });
}

export type ProjectMarketEditInput = z.infer<typeof projectMarketEditSchema>;
