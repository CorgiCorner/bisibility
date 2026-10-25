import { sdkName } from "./openapi-sdk-schema";

const text = { type: ["string", "null"] } as const;
const time = { ...text, format: "date-time" };
/** Nullable dimensions distinguish legacy/no evidence from a classified outcome. */
export const evidenceProjectionSchema = {
  ...sdkName("ProviderEvidenceProjection"),
  type: ["object", "null"],
  properties: {
    acceptance: text,
    fulfillment: text,
    returned_depth: { type: ["integer", "null"], minimum: 0 },
    accounting: text,
    result: text,
    cost: text,
    original_checked_at: time,
    recovery: {
      ...sdkName("ProviderEvidenceRecovery"),
      type: ["object", "null"],
      properties: {
        state: text,
        last_attempt_at: time,
        next_attempt_at: time,
        reason: text,
      },
      required: ["state", "last_attempt_at", "next_attempt_at", "reason"],
    },
  },
  required: [
    "acceptance",
    "fulfillment",
    "returned_depth",
    "accounting",
    "result",
    "cost",
    "original_checked_at",
    "recovery",
  ],
} as const;
