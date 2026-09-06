import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  continueAsNew: vi.fn(),
  loadItems: vi.fn(),
  sleep: vi.fn(),
  startChild: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  continueAsNew: mocks.continueAsNew,
  ParentClosePolicy: { ABANDON: "ABANDON" },
  proxyActivities: vi.fn(() => ({ loadRankCheckRunItemsActivity: mocks.loadItems })),
  sleep: mocks.sleep,
  startChild: mocks.startChild,
}));

import { RANK_CHECK_RUN_CHILD_CONCURRENCY } from "../rank-check/dispatcher-constants";
import { rankCheckRunWorkflow } from "./rank-check-run-workflows";

function item(index: number) {
  return {
    depth: 50 as const,
    id: `item_${String(index).padStart(2, "0")}`,
    keywordId: `keyword_${String(index).padStart(2, "0")}`,
    notBefore: null as string | null,
    projectId: "project_1",
    providerId: "provider-a",
    runId: "run_1",
  };
}

describe("rankCheckRunWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.continueAsNew.mockResolvedValue(undefined);
    mocks.sleep.mockResolvedValue(undefined);
  });

  it("starts 25 ordered children in bounded start batches and does not await completion", async () => {
    const items = Array.from({ length: 25 }, (_, index) => item(index + 1));
    mocks.loadItems.mockResolvedValue({ hasMore: false, items, nextCursor: null });
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    mocks.startChild.mockImplementation(async (_workflowType, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(options.workflowId);
      await Promise.resolve();
      active -= 1;
      return { result: () => new Promise(() => undefined) };
    });

    await expect(rankCheckRunWorkflow({ runId: "run_1" })).resolves.toEqual({
      skipped: 0,
      started: 25,
    });

    expect(order).toEqual(items.map((row) => `rank-check-${row.keywordId}-run-${row.id}`));
    expect(maxActive).toBe(RANK_CHECK_RUN_CHILD_CONCURRENCY);
    expect(mocks.startChild.mock.calls.map(([, options]) => options.args[0].runItemId)).toEqual(
      items.map((row) => row.id),
    );
    for (const [, options] of mocks.startChild.mock.calls) {
      expect(options).toMatchObject({
        parentClosePolicy: "ABANDON",
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      expect(options.args[0]).not.toHaveProperty("rankCheckId");
      expect(options.typedSearchAttributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: expect.objectContaining({ name: "runId" }) }),
        ]),
      );
    }
  });

  it("skips an already-started child without failing the parent", async () => {
    mocks.loadItems.mockResolvedValue({
      hasMore: false,
      items: [item(1), item(2)],
      nextCursor: null,
    });
    mocks.startChild
      .mockRejectedValueOnce({ name: "WorkflowExecutionAlreadyStartedError" })
      .mockResolvedValueOnce({});

    await expect(rankCheckRunWorkflow({ runId: "run_1" })).resolves.toEqual({
      skipped: 1,
      started: 1,
    });
  });

  it("starts no children when the activity hides dispatcher-owned scheduled items", async () => {
    mocks.loadItems.mockResolvedValue({ hasMore: false, items: [], nextCursor: null });

    await expect(rankCheckRunWorkflow({ runId: "run_1" })).resolves.toEqual({
      skipped: 0,
      started: 0,
    });
    expect(mocks.startChild).not.toHaveBeenCalled();
  });

  it("sleeps until notBefore and continues as new after a 200-item page", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => item(index + 1));
    rows[0] = { ...rows[0], notBefore: new Date(Date.now() + 5_000).toISOString() };
    mocks.loadItems.mockResolvedValue({
      hasMore: true,
      items: rows,
      nextCursor: { id: "item_200", notBefore: null },
    });
    mocks.startChild.mockResolvedValue({});

    await rankCheckRunWorkflow({ runId: "run_1", skipped: 2, started: 3 });

    expect(mocks.sleep).toHaveBeenCalledOnce();
    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      cursor: { id: "item_200", notBefore: null },
      runId: "run_1",
      skipped: 2,
      started: 203,
    });
  });
});
