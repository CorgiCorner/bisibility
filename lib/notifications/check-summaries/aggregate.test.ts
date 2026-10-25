import { describe, expect, it } from "vitest";
import { aggregateChecks } from "./aggregate";
import { check, date, thresholds, window } from "./fixtures.test-support";

const baseline = check({
  id: "baseline",
  checkedAt: date("05:00:00"),
  finishedAt: date("05:01:00"),
  position: 10,
});
function aggregate(checks = [check()], history = [baseline], delivered = new Set<string>()) {
  return aggregateChecks({
    checks,
    history,
    end: window.end,
    window,
    thresholds,
    deliveredIncidentIds: delivered,
  });
}
describe("CN-1/CN-5/CN-6/CN-8 durable aggregation", () => {
  it("counts unchanged observations and deadline deferrals without notification events", () => {
    const result = aggregate([
      check(),
      check({
        id: "deferred",
        keywordId: "other",
        status: "deferred",
        deferredReason: "queue_deadline",
      }),
    ]);
    expect(result.counts).toMatchObject({ unchanged: 1, failed: 1 });
    expect(result.entries[1].deferredReason).toBe("queue_deadline");
  });
  it("admits late persistence in the finish window, excluding legacy, restored and cutoff-late checks", () => {
    const result = aggregate([
      check({ terminalPersistedAt: date("07:05:00"), finishedAt: date("06:59:00") }),
      check({ id: "cutoff", terminalPersistedAt: date("07:15:00") }),
      check({ id: "legacy", terminalPersistedAt: null }),
      check({ id: "running", status: "running" }),
      check({ id: "restored", recoveryRestoredAt: date("07:01:00") }),
      check({ id: "next", finishedAt: date("07:05:00") }),
    ]);
    expect(result.checkIds).toEqual(["current"]);
  });
  it("nets a same-window drop and recovery against the pre-window baseline", () => {
    const result = aggregate([
      check({ id: "drop", position: 40 }),
      check({
        id: "recovered",
        checkedAt: date("06:40:00"),
        finishedAt: date("06:41:00"),
        position: 10,
      }),
    ]);
    expect(result.counts).toMatchObject({ up: 0, down: 0, unchanged: 2 });
    expect(result.significant).toBe(false);
  });
  it("keeps the last comparable observation when later failed, partial or under-review checks exist", () => {
    const result = aggregate([
      check({ id: "drop", position: 40 }),
      check({
        id: "later",
        checkedAt: date("06:40:00"),
        finishedAt: date("06:41:00"),
        status: "failed",
      }),
    ]);
    expect(result.counts).toMatchObject({ down: 1, failed: 1 });
  });
  it("never counts first checks, comparison-disabled checks or partial no-matches as movement", () => {
    expect(aggregate([check({ position: 50 })], []).counts.new).toBe(1);
    expect(aggregate([check({ position: 50, comparisonAllowed: false })], []).counts.new).toBe(1);
    expect(aggregate([check({ position: 50, comparisonAllowed: false })]).significant).toBe(false);
    expect(
      aggregate([
        check({
          position: null,
          raw: { recovery: { completeness: "partial", comparisonAllowed: false } },
        }),
      ]).significant,
    ).toBe(false);
    expect(
      aggregate([check({ position: null, raw: { normalization: { outcome: "indeterminate" } } })])
        .significant,
    ).toBe(false);
  });
  it("counts only enqueued non-accounting candidates under review, never failed or movement", () => {
    const candidate = check({ status: "failed", underReview: true, incidentIds: ["incident"] });
    expect(aggregate([candidate]).counts).toMatchObject({ under_review: 1, failed: 0, down: 0 });
    expect(aggregate([candidate]).significant).toBe(true);
    expect(aggregate([candidate], [baseline], new Set(["incident"])).significant).toBe(false);
    expect(aggregate([check({ status: "failed", underReview: false })]).counts.failed).toBe(1);
  });
  it("does not use restored evidence as a movement baseline", () => {
    expect(
      aggregate(
        [check({ position: 50 })],
        [check({ ...baseline, recoveryRestoredAt: date("05:30:00") })],
      ).counts.new,
    ).toBe(1);
  });
});
