import { publicTrackingRevision } from "@/lib/ai-tracking/projections/public";
import { describe, expect, it } from "vitest";
import { trackingAcceptanceSchema, trackingAcceptedDrafts } from "./ai-tracking-acceptance";

describe("trusted suggestion acceptance", () => {
  it("preserves exact edited text and trusted generation source while deduplicating template variants", () => {
    const generationReference = {
      generationId: "asg_abcdefghijklmnopqrstuvwx",
      draftId: "12345678-1234-4234-8234-000000000001",
    };
    const drafts = trackingAcceptedDrafts({
      drafts: [
        {
          text: "  Edited original draft?  ",
          category: "branded",
          provenance: "model_generated_hypothesis",
          generationReference,
        },
        { text: "edited original draft?", category: "branded", provenance: "generated_hypothesis" },
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ text: "  Edited original draft?  ", generationReference });
    const publicRevision = publicTrackingRevision({
      publicId: "apr_safe",
      text: drafts[0].text,
      textHash: "hash",
      ordinal: 2,
      category: "branded",
      createdAt: new Date(),
      provenance: { method: "model_generated_hypothesis", ...generationReference },
      id: "internal-revision",
      projectId: "internal-project",
      promptId: "internal-prompt",
      generationId: "internal-secret",
      generationDraftId: generationReference.draftId,
    });
    expect(publicRevision).toMatchObject({
      generationReference,
      text: "  Edited original draft?  ",
    });
    expect(JSON.stringify(publicRevision)).not.toContain("internal-secret");
  });
  it("rejects arbitrary model, dataset, evidence and popularity claims", () => {
    for (const claim of [
      { provenance: "model_generated_hypothesis" },
      { provenance: "provider_dataset" },
      { evidenceIds: ["fabricated-provider-demand"] },
      { popularity: 500 },
    ]) {
      expect(
        trackingAcceptanceSchema.safeParse({
          drafts: [{ text: "Question?", category: "neutral", ...claim }],
        }).success,
      ).toBe(false);
    }
  });
  it("keeps verified dataset references distinct from model generation", () => {
    const providerDatasetReference = { reportId: "agr_abcdefghijklmnopqrstuvwx", rowIndex: 2 };
    expect(
      trackingAcceptedDrafts({
        drafts: [
          {
            text: "Dataset question?",
            category: "comparative",
            provenance: "provider_dataset",
            providerDatasetReference,
          },
        ],
      })[0].providerDatasetReference,
    ).toEqual(providerDatasetReference);
    expect(
      trackingAcceptanceSchema.safeParse({
        drafts: [
          {
            text: "Question?",
            category: "neutral",
            providerDatasetReference,
            generationReference: {
              generationId: "asg_abcdefghijklmnopqrstuvwx",
              draftId: "12345678-1234-4234-8234-000000000001",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
