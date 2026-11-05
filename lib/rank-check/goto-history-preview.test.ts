import { describe, expect, it } from "vitest";
import type { GotoHistoryClass } from "./goto-history-eligibility";
import { scanGotoHistoryCandidates } from "./goto-history-preview";

describe("scanGotoHistoryCandidates", () => {
  it("pages past more ineligible rows than the limit and counts the eligible remainder", async () => {
    const limit = 1;
    const records: Array<{ checkedAt: Date; classification: GotoHistoryClass; id: string }> = [
      ...Array.from({ length: limit + 2 }, (_, index) => ({
        checkedAt: new Date(Date.UTC(2026, 9, 30, 0, 0, index)),
        classification: "not_eligible_run" as const,
        id: `ineligible-${index}`,
      })),
      ...[0, 1, 2].map((index) => ({
        checkedAt: new Date(Date.UTC(2026, 9, 31, 0, 0, index)),
        classification: "eligible_task_get" as const,
        id: `eligible-${index}`,
      })),
    ];
    const cursors: Array<string | null> = [];
    const result = await scanGotoHistoryCandidates({
      classify: async (id) => records.find((row) => row.id === id)?.classification ?? null,
      limit,
      loadPage: async (cursor) => {
        cursors.push(cursor?.id ?? null);
        const start = cursor ? records.findIndex((row) => row.id === cursor.id) + 1 : 0;
        return records.slice(start, start + 2).map(({ checkedAt, id }) => ({ checkedAt, id }));
      },
    });

    expect(result.rows.map((row) => row.checkId)).toEqual(["eligible-0"]);
    expect(result.rows).toHaveLength(limit);
    expect(result.truncated).toBe(2);
    expect(result.examined).toBe(records.length);
    expect(cursors.length).toBeGreaterThan(1);
    expect(cursors[0]).toBeNull();
    expect(cursors).toContain("ineligible-1");
  });
});
