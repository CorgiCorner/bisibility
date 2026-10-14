import { describe, expect, it } from "vitest";
import { matchBusinessCollection } from "./match";
import { planAutomaticMatch } from "./match-decisions";
import {
  item,
  observationRunId,
  projectId,
  recordedAt,
  revision,
  writeContext,
} from "./test-fixtures";
import { matchSummary } from "./ui-projection";

describe("authorized minimized decision provenance DTO", () => {
  it.each(["automatic", "manual", "rematch"] as const)(
    "retains %s source/version/two distinct times without actor or review reason",
    (source) => {
      const evaluation = matchBusinessCollection({
        projectId,
        observationRunId,
        targets: [revision()],
        items: [item()],
      })[0];
      const decision = planAutomaticMatch({
        id: "decision-a",
        evaluation,
        current: null,
        expectedDecisionRevision: 0,
        context: writeContext,
        recordedAt: "2026-10-02T11:00:00.000Z",
        idempotencyKey: "automatic-a",
      }).decision;
      const dto = matchSummary(
        {
          ...decision,
          source,
          confirmedBy: "private-actor",
          reviewReason: "Private review",
          originalOrdinals: { ...decision.originalOrdinals, group: 9, scale: "maps_organic" },
          observationSource: {
            provider: "synthetic",
            adapterVersion: "actual-retained-v1",
            normalizationVersion: null,
            originalObservedAt: recordedAt,
            rankScale: "maps_organic",
            sourceBlockId: "block-a",
            sourceOrdinal: 7,
          },
        },
        "public-location",
        "maps",
      );
      expect(dto).toMatchObject({
        source,
        matcherVersion: decision.matcherVersion,
        observedAt: recordedAt,
        recordedAt: "2026-10-02T11:00:00.000Z",
        rankScale: "maps_organic",
        originalOrdinals: { group: 9, scale: "maps_organic" },
        sourceOrdinal: 7,
      });
      expect(dto).not.toHaveProperty("confirmedBy");
      expect(dto).not.toHaveProperty("reviewReason");
      expect(dto).not.toHaveProperty("observationSource");
      expect(dto).not.toHaveProperty("projectId");
      expect(JSON.stringify(dto)).not.toContain("private-actor");
    },
  );
});
