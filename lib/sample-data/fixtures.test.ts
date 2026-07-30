import { describe, expect, it } from "vitest";
import { buildSampleDataset, sampleKeywords } from "./fixtures";

const referenceDate = new Date("2026-07-05T13:20:00.000Z");

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe("sample-data fixtures", () => {
  it("is deterministic for the same reference date", () => {
    expect(buildSampleDataset(referenceDate)).toEqual(buildSampleDataset(referenceDate));
  });

  it("covers 30 days for each sample keyword", () => {
    const dataset = buildSampleDataset(referenceDate);
    const days = new Set(dataset.rankChecks.map((check) => dateKey(check.checkedAt)));

    expect(days.size).toBe(30);
    expect(dataset.keywords).toHaveLength(sampleKeywords.length);
    for (const keyword of dataset.keywords) {
      expect(dataset.rankChecks.filter((check) => check.keywordKey === keyword.key)).toHaveLength(
        30,
      );
      expect(
        dataset.trafficSnapshots.filter((snapshot) => snapshot.keywordKey === keyword.key),
      ).toHaveLength(30);
    }
  });

  it("emits signals only for position-change days", () => {
    const dataset = buildSampleDataset(referenceDate);
    const changed = new Set(
      dataset.rankChecks
        .filter(
          (check) => check.previousPosition !== null && check.previousPosition !== check.position,
        )
        .map((check) => check.key),
    );
    const rankingSignals = dataset.signals.filter((signal) => signal.type === "ranking.changed");

    expect(rankingSignals).toHaveLength(changed.size);
    for (const signal of dataset.signals) {
      expect(changed.has(signal.rankCheckKey)).toBe(true);
    }
  });
});
