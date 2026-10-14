import { describe, expect, it, vi } from "vitest";
import { aggregateLocalRows } from "./aggregate";
import { projectLocalCheck, projectLocalRows } from "./projection";
import {
  expectedLocalScope,
  localCheck,
  localDecision,
  localFixtureAsOf,
  localFixtureScope,
} from "./test-fixtures";

vi.mock("server-only", () => ({}));

function fixture() {
  const checks = [
    localCheck("a", 1),
    localCheck("b", 1),
    localCheck("c", 3),
    localCheck("d", 3),
    localCheck("e", 2),
    localCheck("f", 2),
    localCheck("g", null, { absent: true }),
    localCheck("h", null, { absent: true }),
    localCheck("i", null, { failed: true }),
    localCheck("j", null, { incomplete: true, absent: true }),
  ];
  const decisions = new Map(
    checks.slice(0, 6).map((check, index) => {
      const decision = localDecision(check, index < 4 ? "confirmed" : "rejected");
      return [decision.itemId, decision] as const;
    }),
  );
  const targets = checks.map((check) => ({
    id: check.keywordId,
    publicId: check.keywordId,
    text: check.keywordId,
  }));
  const metadata = new Map(
    targets.map(({ publicId }) => [
      publicId,
      { expectedScope: expectedLocalScope(publicId), freshForMs: 7200000 },
    ]),
  );
  return { checks, decisions, targets, metadata };
}
describe("Local pack normalized evidence and generic metric oracle", () => {
  it("reports full ten-target denominators with separate feature, target, conditional and found-only average", () => {
    const f = fixture();
    const report = aggregateLocalRows(
      projectLocalRows(f.targets, f.checks, f.decisions, f.metadata, localFixtureScope),
      localFixtureAsOf,
    );
    expect(report.presence.observedCoverage).toBe(0.8);
    expect(report.presence.value).toBe(75);
    expect(report.targetTop3.value).toBe(50);
    expect(report.conditionalTop3.value).toBeCloseTo((100 * 4) / 6);
    expect(report.averageFoundSlot).toBe(2);
    expect(report.averageFoundCount).toBe(4);
    expect(report.matchCoverage).toBe(1);
    expect(report.targetTop3.delta).toBeNull();
    expect(report.targetTop3.counts.failed).toBe(1);
    expect(report.targetTop3.isTruncated).toBe(false);
  });
  it("ambiguous target match changes match coverage and denominators, not an SEO movement", () => {
    const f = fixture(),
      decision = [...f.decisions.values()][4];
    if (!decision) throw new Error("Expected retained decision");
    f.decisions.set(decision.itemId, { ...decision, status: "candidate" });
    const report = aggregateLocalRows(
      projectLocalRows(f.targets, f.checks, f.decisions, f.metadata, localFixtureScope),
      localFixtureAsOf,
    );
    expect(report.presence.value).toBe(75);
    expect(report.targetTop3.value).toBeCloseTo(400 / 7);
    expect(report.conditionalTop3.value).toBe(80);
    expect(report.matchCoverage).toBe(7 / 8);
    expect(report.targetTop3.delta).toBeNull();
  });
  it.each(["identity", "matcher", "hash", "provider", "slot", "promotion", "time"])(
    "refuses %s proof drift",
    (change) => {
      const check = localCheck("a", 1),
        original = localDecision(check);
      const decision = structuredClone(original);
      if (change === "identity") decision.identityRevisionId = "another-identity";
      if (change === "matcher") decision.matcherVersion = "unknown-matcher";
      if (change === "hash") decision.evidence = {};
      const run = check.observationRun;
      if (!run) throw new Error("Expected observation");
      if (change === "provider") run.provider = "other";
      if (change === "slot") run.items[0].positionInBlock = 2;
      if (change === "promotion") run.items[0].promotion = "unknown";
      if (change === "time") run.items[0].observedAt = new Date("2026-10-13T00:00:00.000Z");
      const value = projectLocalCheck(
        check,
        "a",
        new Map([[decision.itemId, decision]]),
        localFixtureScope,
      );
      expect(value.target.effectiveScope).toBeNull();
      expect(value.target.position).toBeNull();
    },
  );
  it("retains observed slots but refuses current KPI without actual current scope; unknown TTL stays unknown", () => {
    const f = fixture();
    let rows = projectLocalRows(f.targets, f.checks, f.decisions, new Map(), localFixtureScope);
    expect(rows[0].target.current?.reason).toBe("current_scope_unavailable");
    rows = projectLocalRows(
      f.targets,
      f.checks,
      f.decisions,
      new Map([...f.metadata].map(([id, value]) => [id, { ...value, freshForMs: null }])),
      localFixtureScope,
    );
    expect(aggregateLocalRows(rows, localFixtureAsOf).targetTop3.dataCoverage).toBeNull();
    expect(rows[0].target.current?.position).toBe(1);
  });
  it("empty or partial pack is unknown and Maps or organic ordinal is never a Local slot", () => {
    const check = localCheck("a", null, { absent: true, incomplete: true });
    expect(
      projectLocalCheck(check, "a", new Map(), localFixtureScope).presence.completeThrough,
    ).toBeNull();
    const maps = localCheck("a", 1);
    if (!maps.observationRun) throw new Error("Expected observation");
    maps.observationRun.surface = "maps";
    expect(
      projectLocalCheck(maps, "a", new Map(), localFixtureScope).target.effectiveScope,
    ).toBeNull();
  });
});
