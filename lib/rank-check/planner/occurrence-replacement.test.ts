import { describe, expect, it, vi } from "vitest";
import { cancelledOccurrenceReplacement } from "./occurrence-replacement";

const previous = {
  publicId: "rcr_previous",
  status: "completed",
  startedAt: null,
  costCents: 0,
  _count: { items: 2, rankChecks: 0, queuedRankCheckBatches: 0 },
  items: [],
};
const input = {
  projectId: "project",
  scheduleId: "schedule",
  occurrenceKey: "2026-10-21",
  baseKey: "plan:schedule:2026-10-21",
};

describe("cancelled schedule occurrence replacement", () => {
  it("keeps the old receipt and binds one new generation to the latest cancelled run", async () => {
    const findFirst = vi.fn(async (_query: unknown) => previous);
    expect(
      await cancelledOccurrenceReplacement({ rankCheckRun: { findFirst } } as never, input),
    ).toEqual({
      idempotencyKey: "plan:schedule:2026-10-21:after:rcr_previous",
      replacesCancelledRunPublicId: "rcr_previous",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project",
          checkScheduleId: "schedule",
          trigger: "scheduled",
          selectionKind: "scheduled_due",
          selectionSpec: { path: ["occurrenceKey"], equals: "2026-10-21" },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(
      (findFirst.mock.calls[0][0] as { select: { items: { where: { OR: unknown[] } } } }).select
        .items.where.OR,
    ).toEqual(
      expect.arrayContaining([
        { actualCostCents: null },
        { actualCostCents: { not: 0 } },
        { rankCheckId: { not: null } },
        { blockedReason: null },
        { blockedReason: { not: "schedule_changed" } },
        { status: { not: "cancelled" } },
      ]),
    );
  });

  it("advances through successive cancelled generations and stops at a live replacement", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce({ ...previous, publicId: "rcr_second" })
      .mockResolvedValueOnce({ ...previous, publicId: "rcr_third", status: "planned" });
    const tx = { rankCheckRun: { findFirst } } as never;
    expect((await cancelledOccurrenceReplacement(tx, input))?.idempotencyKey).toBe(
      `${input.baseKey}:after:rcr_previous`,
    );
    expect((await cancelledOccurrenceReplacement(tx, input))?.idempotencyKey).toBe(
      `${input.baseKey}:after:rcr_second`,
    );
    expect(await cancelledOccurrenceReplacement(tx, input)).toBeNull();
  });

  it.each([
    null,
    { ...previous, status: "queued" },
    { ...previous, status: "planned" },
    { ...previous, status: "running" },
    { ...previous, startedAt: new Date() },
    { ...previous, costCents: 1 },
    { ...previous, items: [{ id: "not-safely-cancelled" }] },
    { ...previous, _count: { ...previous._count, items: 0 } },
    { ...previous, _count: { ...previous._count, rankChecks: 1 } },
    { ...previous, _count: { ...previous._count, queuedRankCheckBatches: 1 } },
  ])(
    "never replays a missing, active, attempted or incompletely cancelled occurrence %#",
    async (row) => {
      expect(
        await cancelledOccurrenceReplacement(
          { rankCheckRun: { findFirst: vi.fn(async () => row) } } as never,
          input,
        ),
      ).toBeNull();
    },
  );
});
