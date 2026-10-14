import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

export const usageDisplayPrecisions = [0, 1, 2, 3, 4, 6] as const;
const precision = z
  .number()
  .int()
  .refine((value) => (usageDisplayPrecisions as readonly number[]).includes(value));
export const usageDisplayOptionsSchema = z
  .object({
    moneyDisplay: z.enum(["currency", "raw-unit"]),
    moneyFractionDigits: precision,
    quantityFractionDigits: precision,
  })
  .strict();
export type UsageDisplayOptions = z.infer<typeof usageDisplayOptionsSchema>;
export const defaultUsageDisplayOptions: UsageDisplayOptions = Object.freeze({
  moneyDisplay: "currency",
  moneyFractionDigits: 2,
  quantityFractionDigits: 2,
});
export const usageDisplayDocumentSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(1).max(2147483647),
    options: usageDisplayOptionsSchema,
  })
  .strict();
export const updateUsageDisplaySchema = z
  .object({
    projectId: z
      .string()
      .max(120)
      .refine((value) => isPublicIdOfType(value, "prj")),
    expectedRevision: z.number().int().min(0).max(2147483646),
    options: usageDisplayOptionsSchema,
  })
  .strict();
export type ProjectUsageDisplaySettings = Readonly<{
  projectId: string;
  revision: number;
  options: UsageDisplayOptions;
  canEdit: boolean;
}>;
export type UsageDisplaySaveResult =
  | { kind: "saved"; value: ProjectUsageDisplaySettings }
  | { kind: "conflict"; value: ProjectUsageDisplaySettings }
  | { kind: "forbidden" | "invalid" | "failed" };
