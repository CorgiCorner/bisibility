import { describe, expect, it, vi } from "vitest";
import { type DispatcherStateHealStore, runDispatcherStateHeal } from "./dispatcher-state-heal";

const emptyCoverage = {
  coverageCountsStable: true,
  eligible: 2,
  eligibleWithState: 2,
  exact: true,
  gone: 0,
  ineligible: 0,
  maxNextCheckAt: "2026-07-30T00:00:00.000Z",
  minNextCheckAt: "2026-07-29T12:00:00.000Z",
  missing: 0,
  oldestDueLagMs: 0,
  recurrenceMismatches: 0,
  recurrenceScanRows: 2,
  recurrenceScanStable: true,
};

function page(overrides = {}) {
  return {
    cursor: "k2",
    done: true,
    inserted: 0,
    removed: 0,
    selected: 2,
    skippedLocked: 0,
    unchanged: 2,
    updated: 0,
    ...overrides,
  };
}

describe("runDispatcherStateHeal", () => {
  it("checkpoints every bounded batch and verifies again from the start", async () => {
    const heal = vi
      .fn()
      .mockResolvedValueOnce(page({ cursor: "k1", done: false, selected: 1 }))
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page());
    const store: DispatcherStateHealStore = {
      coverage: vi.fn().mockResolvedValue(emptyCoverage),
      heal,
      remove: vi.fn().mockResolvedValue(page({ selected: 0 })),
    };
    const checkpoints: unknown[] = [];

    const result = await runDispatcherStateHeal({
      dryRun: false,
      onCheckpoint: async (checkpoint) => {
        checkpoints.push(checkpoint);
      },
      pageSize: 2,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      store,
    });

    expect(result.verdict).toBe("PASS");
    expect(heal.mock.calls.map((call) => call[0].cursor)).toEqual([null, "k1", null]);
    expect(checkpoints).toHaveLength(5);
  });

  it("returns an incomplete verdict when verification skips a locked row", async () => {
    const store: DispatcherStateHealStore = {
      coverage: vi.fn().mockResolvedValue(emptyCoverage),
      heal: vi
        .fn()
        .mockResolvedValueOnce(page())
        .mockResolvedValueOnce(page({ skippedLocked: 1, unchanged: 1 })),
      remove: vi.fn().mockResolvedValue(page({ selected: 0 })),
    };

    const result = await runDispatcherStateHeal({
      dryRun: false,
      pageSize: 2,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      store,
    });

    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.hardGateReasons).toContain("reconciliation-skipped-locked");
  });

  it("returns an incomplete verdict when ineligible-row removal skips a lock", async () => {
    const store: DispatcherStateHealStore = {
      coverage: vi.fn().mockResolvedValue(emptyCoverage),
      heal: vi.fn().mockResolvedValue(page()),
      remove: vi.fn().mockResolvedValue(page({ removed: 0, selected: 1, skippedLocked: 1 })),
    };

    const result = await runDispatcherStateHeal({
      dryRun: false,
      pageSize: 2,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      store,
    });

    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.hardGateReasons).toContain("reconciliation-skipped-locked");
  });

  it("stops after one batch with a resumable non-passing checkpoint", async () => {
    const store: DispatcherStateHealStore = {
      coverage: vi.fn(),
      heal: vi.fn().mockResolvedValue(page({ cursor: "k1", done: false, selected: 1 })),
      remove: vi.fn(),
    };

    const result = await runDispatcherStateHeal({
      dryRun: false,
      pageSize: 1,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      stopAfterBatch: true,
      store,
    });

    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.checkpoint).toMatchObject({ cursor: "k1", phase: "heal" });
    expect(store.coverage).not.toHaveBeenCalled();
  });

  it("keeps dry run pure and fails the gate when changes are required", async () => {
    const store: DispatcherStateHealStore = {
      coverage: vi.fn().mockResolvedValue({ ...emptyCoverage, exact: false, missing: 1 }),
      heal: vi.fn().mockResolvedValue(page({ inserted: 1, unchanged: 1 })),
      remove: vi.fn().mockResolvedValue(page({ selected: 0 })),
    };

    const result = await runDispatcherStateHeal({
      dryRun: true,
      pageSize: 2,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      store,
    });

    expect(result.verdict).toBe("INCOMPLETE");
    expect(store.heal).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it.each([
    {
      label: "exactly one full page",
      pages: [{ cursor: "k200", done: false, removed: 200, selected: 200 }],
      total: 200,
    },
    {
      label: "multiple full pages",
      pages: [
        { cursor: "k200", done: false, removed: 200, selected: 200 },
        { cursor: "k400", done: false, removed: 200, selected: 200 },
        { cursor: "k450", done: true, removed: 50, selected: 50 },
      ],
      total: 450,
    },
  ])("bounds dry-run removal for $label", async ({ pages, total }) => {
    const byCursor = new Map<string | null, (typeof pages)[number]>();
    let previous: string | null = null;
    for (const entry of pages) {
      byCursor.set(previous, entry);
      previous = entry.cursor;
    }
    if (!pages.at(-1)?.done) {
      byCursor.set(previous, {
        cursor: previous as string,
        done: true,
        removed: 0,
        selected: 0,
      });
    }
    const remove = vi.fn(async (options: { cursor?: string | null }) => {
      if (options.cursor === undefined) {
        throw new Error("dry-run removal did not supply a monotonic cursor");
      }
      const next = byCursor.get(options.cursor);
      if (next) return page(next);
      return page({ cursor: options.cursor, done: true, removed: 0, selected: 0 });
    });
    const store: DispatcherStateHealStore = {
      coverage: vi.fn().mockResolvedValue({ ...emptyCoverage, exact: false, ineligible: total }),
      heal: vi.fn().mockResolvedValue(page({ selected: 0 })),
      remove,
    };

    const result = await runDispatcherStateHeal({
      dryRun: true,
      pageSize: 200,
      reconcileAt: new Date("2026-07-29T10:00:00.000Z"),
      store,
    });

    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.checkpoint.totals.removed).toBe(total);
    expect(remove.mock.calls.length).toBeLessThanOrEqual(pages.length + 1);
  });
});
