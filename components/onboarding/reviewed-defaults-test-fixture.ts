import { type ProjectDefaultsInput, projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsPreview } from "@/lib/settings/reviewed-defaults-contract";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, screen } from "@testing-library/react";

export async function previewDefaultsFixture(
  input: ProjectDefaultsInput,
): Promise<DefaultsPreview> {
  const draft = projectDefaultsSchema.parse(input);
  return {
    request: { kind: "form", values: draft },
    draft,
    expectedRevision: "1",
    expectedSourceHash: "a".repeat(64),
    previewToken: "synthetic-reviewed-defaults",
    expiresAt: "2029-10-13T00:10:00Z",
    resolved: {
      locationKey: "US",
      label: "United States",
      languageCode: "en",
      device: draft.device,
    },
    impact: {
      existingTargetRetargets: 0,
      newTargets: 0,
      inheritedDepthTargets: 0,
      recurringEstimate: "unknown",
      scopeChanged: false,
      cadenceChanged: true,
    },
    policyReady: true,
  };
}
export async function confirmDefaultsFixture(submitName = "Continue") {
  const consent = await screen.findByRole("checkbox", {
    name: shared.shared.reviewedDefaults.consent,
  });
  fireEvent.click(consent);
  fireEvent.click(screen.getByRole("button", { name: submitName }));
}
