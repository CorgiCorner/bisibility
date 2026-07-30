import { describe, expect, it, vi } from "vitest";
import {
  deleteOwnedRankCheckSchedule,
  inventoryRankCheckSchedules,
  pauseOwnedRankCheckSchedule,
} from "./temporal-schedule-inventory";

function attributes(keywordId = "keyword_1") {
  return {
    getAll: () => [
      { key: { name: "keywordId" }, value: keywordId },
      { key: { name: "projectId" }, value: "project_1" },
    ],
  };
}

function ownedDescription(keywordId = "keyword_1") {
  const typedSearchAttributes = attributes(keywordId);
  return {
    action: {
      args: [{ keywordId }],
      typedSearchAttributes,
      workflowId: `rank-check-${keywordId}`,
      workflowType: "rankCheckWorkflow",
    },
    memo: { kind: "rank-check", keywordId, projectId: "project_1" },
    scheduleId: `rank-check-${keywordId}`,
    state: { paused: false },
    typedSearchAttributes,
  };
}

describe("inventoryRankCheckSchedules", () => {
  it("counts a listed Schedule that disappears before inspection as failed evidence", async () => {
    const describe = vi.fn().mockRejectedValue(
      Object.assign(new Error("Schedule disappeared"), {
        name: "ScheduleNotFoundError",
      }),
    );
    const client = {
      getHandle: vi.fn(() => ({ describe })),
      list: vi.fn(async function* () {
        yield { scheduleId: "rank-check-disappeared" };
      }),
    };

    const result = await inventoryRankCheckSchedules(10, client as never);

    expect(result).toMatchObject({ failed: 1, inspected: 0, listed: 1 });
    expect(result.ownedIds).toEqual([]);
  });

  it("retains contradictory list evidence when a later description looks owned", async () => {
    const description = ownedDescription();
    const client = {
      getHandle: vi.fn(() => ({ describe: vi.fn().mockResolvedValue(description) })),
      list: vi.fn(async function* () {
        yield {
          action: { workflowType: "rankCheckWorkflow" },
          memo: { kind: "rank-check", keywordId: "keyword_2", projectId: "project_1" },
          scheduleId: "rank-check-keyword_1",
          typedSearchAttributes: attributes(),
        };
      }),
    };

    const result = await inventoryRankCheckSchedules(10, client as never);

    expect(result.ambiguousIds).toEqual(["rank-check-keyword_1"]);
    expect(result.ownedIds).toEqual([]);
  });

  it("refuses pause and delete when the current same-ID description is not exact owned state", async () => {
    const pause = vi.fn();
    const remove = vi.fn();
    const replacement = {
      ...ownedDescription("keyword_2"),
      scheduleId: "rank-check-keyword_1",
    };
    const client = {
      getHandle: vi.fn(() => ({
        delete: remove,
        describe: vi.fn().mockResolvedValue(replacement),
        pause,
      })),
      list: vi.fn(),
    };

    await expect(
      pauseOwnedRankCheckSchedule("rank-check-keyword_1", client as never),
    ).rejects.toThrow("no longer satisfies exact ownership");
    await expect(
      deleteOwnedRankCheckSchedule("rank-check-keyword_1", client as never),
    ).rejects.toThrow("no longer satisfies exact ownership");
    expect(pause).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
