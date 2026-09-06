import { describe, expect, it } from "vitest";
import { chunkQueuedRankCheckGroup, queuedBatchWorkflowId } from "./queued-batches";

function group(count: number) {
  return {
    claimedAt: "2026-07-29T00:00:00.000Z",
    device: "desktop",
    keywordIds: Array.from({ length: count }, (_, index) => `keyword_${index + 1}`),
    locationId: "location_1",
    projectId: "project_1",
    runId: "run_1",
  };
}

describe("queued rank-check batches", () => {
  it("keeps 100 keywords in one deterministic chunk", () => {
    const chunks = chunkQueuedRankCheckGroup(group(100));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ chunkIndex: 0 });
    expect(chunks[0]?.keywordIds).toHaveLength(100);
  });

  it("splits 101 keywords into deterministic chunks of 100 and 1", () => {
    const chunks = chunkQueuedRankCheckGroup(group(101));

    expect(chunks.map((chunk) => chunk.keywordIds.length)).toEqual([100, 1]);
    expect(chunks[0]?.keywordIds[0]).toBe("keyword_1");
    expect(chunks[1]?.keywordIds).toEqual(["keyword_101"]);
  });

  it("keeps claimed item ids aligned across chunk boundaries", () => {
    const input = group(101);
    const chunks = chunkQueuedRankCheckGroup({
      ...input,
      runId: "run_1",
      runItemIds: input.keywordIds.map((_, index) => `item_${index + 1}`),
    });

    expect(chunks[0]?.runItemIds).toHaveLength(100);
    expect(chunks[1]).toMatchObject({
      keywordIds: ["keyword_101"],
      runId: "run_1",
      runItemIds: ["item_101"],
    });
    expect(() => chunkQueuedRankCheckGroup({ ...group(2), runItemIds: ["item_1"] })).toThrow(
      "runItemIds must align with keywordIds.",
    );
  });

  it("keeps keyword text and credentials out of workflow identity", () => {
    const id = queuedBatchWorkflowId({
      ...group(1),
      chunkIndex: 0,
      keywordIds: ["keyword_1"],
    });

    expect(id).toBe("queued-rank-check-project_1-run_1-location_1-desktop-1785283200000-0");
    expect(id).not.toContain("secret");
  });

  it("uses the run id to distinguish otherwise identical batch identities", () => {
    const input = { ...group(1), chunkIndex: 0 };

    expect(queuedBatchWorkflowId({ ...input, runId: "run_1" })).not.toBe(
      queuedBatchWorkflowId({ ...input, runId: "run_2" }),
    );
  });

  it("keeps workflow identity stable for identical inputs", () => {
    const input = { ...group(1), chunkIndex: 0 };

    expect(queuedBatchWorkflowId(input)).toBe(queuedBatchWorkflowId({ ...input }));
  });
});
