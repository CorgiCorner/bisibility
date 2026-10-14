import { describe, expect, it } from "vitest";
import { localPointEvidence } from "./evidence";
import { exportLocalRunResult } from "./export";
import { localResultFixture, resultObservation } from "./fixture";
import type { LocalMonitorRunResult } from "./model";
import { projectLocalRun } from "./projection";

function reportFixture() {
  const { binding, receipt, now } = localResultFixture();
  const row = binding.rows[0],
    saved = resultObservation(row),
    evidence = localPointEvidence(
      row,
      saved.observation,
      saved.decisions,
      binding.definition.identityRevisionId,
      now,
    );
  const projection = projectLocalRun(binding, new Map([[row.item.id, evidence]]), receipt, now);
  const report: LocalMonitorRunResult = {
    version: 1,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
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
      matcher: "business-match-maps-v1",
      normalizerVersions: [binding.rows[0].record.adapterVersion],
      metricDefinition: "sampled-grid-top-n-v1",
    },
    financialBasis: "current_accounting_state",
    receipt,
    ...projection,
  };
  return { binding, receipt, now, row, saved, report };
}
describe("actual retained Maps evidence to shared report and Local export", () => {
  it("qualifies a strong ID on native Maps group with acknowledged seed scope", () => {
    const { report, saved } = reportFixture();
    expect(saved.evaluations[0]).toMatchObject({
      status: "confirmed",
      organicEligible: true,
      matcherVersion: "business-match-maps-v1",
      originalOrdinals: { group: 1, slot: null, absolute: 1 },
    });
    expect(report.points[0]).toMatchObject({
      position: 1,
      evidence: "positive",
      reason: null,
      scopeClass: "coordinate_seed",
      identityMatch: "confirmed",
      freshness: "unknown",
    });
    expect(report.grids[0]).toMatchObject({
      observedRate: 1,
      observedCoverage: 1,
      dataCoverage: null,
      sampleBounds: null,
      comparison: "unavailable",
      counts: { metricEligible: 1 },
    });
    const json = JSON.parse(exportLocalRunResult(report, "json").text);
    expect(json).toMatchObject({
      report: "local-point-report-v1",
      version: 1,
      financialBasis: "current_accounting_state",
      points: [{ position: 1, evidence: "positive" }],
    });
    expect(JSON.stringify(json)).not.toContain("taskIds");
    expect(JSON.stringify(json)).not.toContain("costCents");
  });
  it.each(["weak", "promoted", "unsafe", "unacknowledged"] as const)(
    "does not promote %s proof to a metric",
    (kind) => {
      const { binding, row, now } = reportFixture(),
        saved = resultObservation(row, { [kind]: true }),
        evidence = localPointEvidence(
          row,
          saved.observation,
          saved.decisions,
          binding.definition.identityRevisionId,
          now,
        ),
        projection = projectLocalRun(
          binding,
          new Map([[row.item.id, evidence]]),
          localResultFixture().receipt,
          now,
        );
      expect(projection.points[0].position).toBeNull();
      expect(projection.grids[0].observedRate).toBeNull();
      expect(projection.grids[0].counts.metricEligible).toBe(0);
      if (kind === "unacknowledged")
        expect(projection.points[0]).toMatchObject({
          observedPosition: 1,
          reason: "missing_scope",
          scopeClass: "unavailable",
        });
    },
  );
  it("rejects missing, altered or foreign original match authority", () => {
    const { row, saved, binding, now } = reportFixture();
    expect(() =>
      localPointEvidence(row, saved.observation, [], binding.definition.identityRevisionId, now),
    ).toThrow();
    expect(() =>
      localPointEvidence(
        row,
        saved.observation,
        [{ ...saved.decisions[0], identityRevisionId: "foreign" }, ...saved.decisions.slice(1)],
        binding.definition.identityRevisionId,
        now,
      ),
    ).toThrow();
  });
  it("never promotes future evidence or creates exhaustive absence", () => {
    const { row, saved, binding, now } = reportFixture();
    const future = { ...saved.observation, createdAt: new Date(now.getTime() + 1) };
    expect(
      localPointEvidence(row, future, saved.decisions, binding.definition.identityRevisionId, now)
        .measurement.execution,
    ).toBe("pending");
    expect(saved.run.completeness).toBe("unknown");
    expect(saved.run.requestPolicy.evidence?.completeThrough.map_listing).toBeNull();
  });
  it("preserves negative canonical decimal coordinates and protects text formulas", () => {
    const { report } = reportFixture();
    const changed = {
      ...report,
      points: report.points.map((point) => ({ ...point, keyword: "=HYPERLINK(1)" })),
    };
    const csv = exportLocalRunResult(changed, "csv").text;
    expect(csv).toContain('"-21.0000000"');
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).not.toContain("'-21.0000000");
  });
  it("keeps full25 point oracle:20 observed,10 Top3,5 unknown and captured freshness gives40-60 bounds", () => {
    const { binding, receipt, now } = localResultFixture(5);
    const evidence = new Map(
      binding.rows.map((row, index) => {
        const saved = resultObservation(row, { rank: index < 10 ? 3 : 6 });
        const value = localPointEvidence(
          row,
          index < 20 ? saved.observation : null,
          index < 20 ? saved.decisions : [],
          binding.definition.identityRevisionId,
          now,
        );
        return [row.item.id, value];
      }),
    );
    const report = projectLocalRun(binding, evidence, receipt, now, { freshForMs: 3600000 });
    expect(report.grids[0]).toMatchObject({
      expected: 25,
      observedRate: 0.5,
      observedCoverage: 0.8,
      dataCoverage: 0.8,
      sampleBounds: [0.4, 0.6],
      counts: { measured: 20, metricEligible: 20, unknown: 5 },
    });
    const manual = projectLocalRun(binding, evidence, receipt, now);
    expect(manual.grids[0]).toMatchObject({
      observedRate: 0.5,
      observedCoverage: 0.8,
      dataCoverage: null,
      sampleBounds: null,
    });
  });
});
