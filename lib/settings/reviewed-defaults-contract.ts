import { projectDefaultsPatchSchema, projectDefaultsSchema } from "@/lib/schemas/project";
import { z } from "zod";

export const defaultsReviewSchema = z
  .object({
    expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    expectedRevision: z.string().regex(/^(0|[1-9]\d*)$/u),
    previewToken: z.string().min(1).max(8192),
    idempotencyKey: z.string().trim().min(8).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const defaultsRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("form"), values: projectDefaultsSchema }).strict(),
  z.object({ kind: z.literal("patch"), values: projectDefaultsPatchSchema }).strict(),
]);
export type DefaultsRequest = z.infer<typeof defaultsRequestSchema>;
export type DefaultsReview = z.infer<typeof defaultsReviewSchema>;
export type DefaultsPreview = Readonly<{
  request: DefaultsRequest;
  draft: z.infer<typeof projectDefaultsSchema>;
  expectedSourceHash: string;
  expectedRevision: string;
  previewToken: string;
  expiresAt: string;
  resolved: { locationKey: string; label: string; languageCode: string; device: string };
  impact: {
    existingTargetRetargets: 0;
    newTargets: 0;
    inheritedDepthTargets: number;
    recurringEstimate: "unchanged" | "unknown";
    scopeChanged: boolean;
    cadenceChanged: boolean;
  };
  policyReady: boolean;
}>;
export class DefaultsReviewRequiredError extends Error {
  readonly code = "preview_required";
  constructor() {
    super("Review the current settings preview and explicitly confirm before saving.");
  }
}
