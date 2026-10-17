import { projectLocalCheck } from "@/lib/dashboard-local/projection";
import { localCheck, localDecision, localFixtureScope } from "@/lib/dashboard-local/test-fixtures";
import { localPointEvidence } from "@/lib/local-monitor-results/evidence";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import { projectLocalRun } from "@/lib/local-monitor-results/projection";
import { describe, expect, it } from "vitest";
import { businessMatcherVersion, mapsBusinessMatcherVersion } from "./dto";
import { matchBusinessCollection } from "./match";
import { organicEligibility } from "./match-evidence";
import { item, observationRunId, projectId, revision } from "./test-fixtures";

const evaluate = (items: Parameters<typeof matchBusinessCollection>[0]["items"]) =>
  matchBusinessCollection({ projectId, observationRunId, items, targets: [revision()] });

describe("versioned promotion-aware matching", () => {
  it("gives newly evaluated rules new version identifiers", () => {
    expect(businessMatcherVersion).toBe("business-match-v2");
    expect(mapsBusinessMatcherVersion).toBe("business-match-maps-v2");
  });
  it.each(["business-match-maps-v1", "business-match-maps-v2"])(
    "retains Maps group eligibility under stored %s",
    (matcherVersion) => {
      expect(
        organicEligibility({
          matcherVersion,
          status: "confirmed",
          promotion: "organic",
          localResult: true,
          originalOrdinals: {
            page: null,
            block: null,
            slot: null,
            absolute: 1,
            group: 1,
            scale: "maps_organic",
          },
        }),
      ).toBe(true);
    },
  );
  it.each(["business-match-maps-v1", "business-match-maps-v2"])(
    "reads retained decisions without rewriting %s provenance",
    (matcherVersion) => {
      const { binding, now } = localResultFixture(),
        row = binding.rows[0];
      const saved = resultObservation(row);
      const decisions = saved.decisions.map((decision) => ({ ...decision, matcherVersion }));
      const before = structuredClone(decisions);
      const value = localPointEvidence(
        row,
        saved.observation,
        decisions,
        binding.definition.identityRevisionId,
        now,
      );
      expect(value.measurement.position).toBe(1);
      expect(value.measurement.normalizationVersion).toBe(
        `${row.record.adapterVersion}:${matcherVersion}`,
      );
      expect(decisions).toEqual(before);
    },
  );
  it("keeps the stored web matcher in the historical measurement key", () => {
    const check = localCheck("legacy", 1),
      decision = { ...localDecision(check), matcherVersion: "business-match-v1" };
    const projected = projectLocalCheck(
      check,
      check.keywordId,
      new Map([[decision.itemId, decision]]),
      localFixtureScope,
    );
    expect(projected.target.position).toBe(1);
    expect(projected.target.effectiveScope?.identityRevision).toBe("identity-1:business-match-v1");
  });
  it("preserves mixed-version grid points and receipt while withholding its aggregate", () => {
    const { binding, receipt, now } = localResultFixture(3);
    const evidence = new Map(
      binding.rows.map((row, index) => {
        const saved = resultObservation(row);
        const matcherVersion = index === 0 ? "business-match-maps-v1" : "business-match-maps-v2";
        return [
          row.item.id,
          localPointEvidence(
            row,
            saved.observation,
            saved.decisions.map((decision) => ({ ...decision, matcherVersion })),
            binding.definition.identityRevisionId,
            now,
          ),
        ] as const;
      }),
    );
    const projected = projectLocalRun(binding, evidence, receipt, now, { freshForMs: 3600000 });
    expect(projected.points).toHaveLength(9);
    expect(projected.points.every((point) => point.position === 1)).toBe(true);
    expect(projected.points.map((point) => point.receipt)).toEqual(receipt.items);
    expect(projected.grids[0]).toMatchObject({
      reason: "matcher_version_mixed",
      observedRate: null,
      sampleBounds: null,
      observedCoverage: 1,
      dataCoverage: 1,
      expected: 9,
      counts: { measured: 9, ranked: 9 },
    });
  });
  it("keeps organic duplicate identities ambiguous across missing scales and result kinds", () => {
    const finder = {
      ...item("positioned", 2),
      surface: "local_finder" as const,
      resultKind: "listing" as const,
      originalOrdinals: {
        page: null,
        block: null,
        slot: null,
        absolute: 2,
        group: 2,
        scale: "finder_group" as const,
      },
    };
    const unpositioned = {
      ...finder,
      itemId: "unpositioned",
      originalOrdinals: {
        page: null,
        block: null,
        slot: null,
        absolute: null,
        group: null,
        scale: null,
      },
    };
    for (const rows of [
      [finder, unpositioned],
      [item("pack", 3), { ...item("web", 3), resultKind: "organic_result" as const }],
    ])
      expect(
        evaluate(rows).every(
          (row) => row.reason === "ambiguous_exact_items" && !row.organicEligible,
        ),
      ).toBe(true);
  });
});
