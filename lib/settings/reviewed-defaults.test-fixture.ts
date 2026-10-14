import { type ProjectDefaultsInput, projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsPreview } from "./reviewed-defaults-contract";

/** UI-only synthetic response; it cannot mint the server's HMAC or write permit. */
export async function reviewedDefaultsPreview(
  values: ProjectDefaultsInput,
): Promise<DefaultsPreview> {
  const draft = projectDefaultsSchema.parse(values);
  return {
    request: { kind: "form", values: draft },
    draft,
    expectedSourceHash: "a".repeat(64),
    expectedRevision: "9007199254740993123",
    previewToken: "synthetic-ui-review-not-a-server-token",
    expiresAt: "2030-10-13T12:10:00.000Z",
    resolved: {
      locationKey: draft.locationKey ?? "US",
      label: draft.country,
      languageCode: "en",
      device: draft.device,
    },
    impact: {
      existingTargetRetargets: 0,
      newTargets: 0,
      inheritedDepthTargets: 2,
      recurringEstimate: "unknown",
      scopeChanged: true,
      cadenceChanged: true,
    },
    policyReady: false,
  };
}
