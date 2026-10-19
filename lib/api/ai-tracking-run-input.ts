import { planTrackingRunSchema, sourceConfigurationSchema } from "@/lib/ai-tracking/schema";
import { z } from "zod";

// Literal patterns: semgrep rejects RegExp built from a variable, even a constant prefix.
const publicIdPatterns = {
  aip: /^aip_[a-z][a-z0-9]{23}$/,
  ais: /^ais_[a-z][a-z0-9]{23}$/,
  conn: /^conn_[a-z][a-z0-9]{23}$/,
} as const;
const publicId = (prefix: keyof typeof publicIdPatterns) =>
  z.string().regex(publicIdPatterns[prefix]);
const emptyToAbsent = (value: unknown) => (value === "" ? undefined : value);

// Catalog/connection lookups already require these project-scoped public IDs. Validate the
// syntax at the REST boundary too, while retaining empty optional IDs as default selection.
export const trackingPreviewSchema = z.object({
  promptIds: z.array(publicId("aip").min(1)).min(1).max(100),
  configurations: z.array(sourceConfigurationSchema).min(1).max(20),
  credentialConnectionId: z.preprocess(emptyToAbsent, publicId("conn").optional()),
});
export const trackingRunApiPlanSchema = planTrackingRunSchema.safeExtend({
  promptIds: z.array(publicId("aip").min(1)).min(1).max(100),
  credentialConnectionId: publicId("conn").min(1),
  scheduleId: publicId("ais").optional(),
});

/** Match trackingPlan's existing empty schedule ID normalization before typed validation. */
export function parseTrackingRunApiPlan(value: unknown) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...value, scheduleId: emptyToAbsent((value as Record<string, unknown>).scheduleId) }
      : value;
  return trackingRunApiPlanSchema.parse(input);
}
