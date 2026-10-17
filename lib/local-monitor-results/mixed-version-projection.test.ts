import { publicLocalRunResult } from "@/lib/api/local-monitor-public";
import { localMonitorPartSchemas } from "@/lib/api/openapi-local-monitor-parts";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { projectLocalHostItem } from "@/lib/local-monitoring-host/projection";
import { localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import { describe, expect, it } from "vitest";
import { localPointEvidence } from "./evidence";
import { localResultFixture, resultObservation } from "./fixture";
import type { LocalMonitorRunResult } from "./model";
import { projectLocalRun } from "./projection";

function fixture() {
  const { binding, receipt, now } = localResultFixture(3);
  const keyword = {
    ...binding.definition.keywords[0],
    id: "keyword-b",
    publicId: "kw_bbbbbbbbbbbbbbbbbbbbbbbb",
    text: "Second keyword",
  };
  const additional = binding.rows.map((row, index) => {
    const target = {
      ...row.target,
      keywordId: keyword.id,
      keywordRevision: localKeywordRevision(keyword),
    };
    const targetKey = executionTargetKey(target);
    return {
      ...row,
      keyword,
      target,
      stored: {
        ...row.stored,
        id: `second-target-${index}`,
        keywordId: keyword.id,
        publicId: `lmt_${String(index).padStart(24, "b")}`,
        targetKey,
      },
      item: { ...row.item, id: `second-item-${index}` },
      record: { ...row.record, targetKey, key: `second-${row.record.key}` },
    };
  });
  binding.definition = {
    ...binding.definition,
    keywords: [...binding.definition.keywords, keyword],
  };
  binding.rows.push(...additional);
  const fullReceipt = {
    ...receipt,
    expectedCount: 18,
    counts: { ...receipt.counts, items: 18, complete: 18 },
    items: [
      ...receipt.items,
      ...additional.map((row) => ({
        targetId: row.stored.publicId,
        ...projectLocalHostItem(row.record, "settled", false),
      })),
    ],
  };
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
  const projection = projectLocalRun(binding, evidence, fullReceipt, now, { freshForMs: 3600000 });
  const report: LocalMonitorRunResult = {
    version: 1,
    projectId: binding.run.projectId,
    monitorId: "lmn_abcdefghijklmnopqrstuvwx",
    runId: binding.run.publicId,
    asOf: now.toISOString(),
    createdAt: binding.run.createdAt.toISOString(),
    definitionRevisionId: binding.revision.id,
    definitionRevision: 1,
    identityRevisionId: binding.definition.identityRevisionId,
    subject: "Synthetic business",
    protocol: {
      geometry: binding.definition.grid.geometryModel,
      matcher: "business-match-maps-v1|business-match-maps-v2",
      normalizerVersions: [binding.rows[0].record.adapterVersion],
      metricDefinition: "sampled-grid-top-n-v1",
    },
    financialBasis: "current_accounting_state",
    receipt: fullReceipt,
    ...projection,
  };
  return { report, fullReceipt };
}

describe("mixed-methodology aggregate isolation", () => {
  it("preserves all points, receipts and the homogeneous keyword grid", () => {
    const { report, fullReceipt } = fixture();
    expect(report.points).toHaveLength(18);
    expect(report.points.every((point) => point.position === 1)).toBe(true);
    expect(report.receipt).toEqual(fullReceipt);
    expect(report.grids[0]).toMatchObject({
      reason: "matcher_version_mixed",
      observedRate: null,
      sampleBounds: null,
      observedCoverage: 1,
      dataCoverage: 1,
      counts: { measured: 9 },
    });
    expect(report.grids[1]).toMatchObject({
      observedRate: 1,
      sampleBounds: [1, 1],
      observedCoverage: 1,
      dataCoverage: 1,
      expected: 9,
    });
    expect(report.grids[1]).not.toHaveProperty("reason");
  });
  it("exposes the optional reason without changing homogeneous wire shapes", () => {
    const { report } = fixture();
    const wire = publicLocalRunResult(report);
    expect(wire.grids[0]).toMatchObject({ reason: "matcher_version_mixed", observedRate: null });
    expect(wire.grids[1]).not.toHaveProperty("reason");
    const schema = localMonitorPartSchemas().grid;
    expect(schema.properties.reason).toMatchObject({ enum: ["matcher_version_mixed"] });
    expect(schema.required).not.toContain("reason");
  });
});
