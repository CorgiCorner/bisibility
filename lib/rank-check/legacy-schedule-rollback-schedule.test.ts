import { describe, expect, it, vi } from "vitest";
import { ensurePausedRollbackScheduleWithClient } from "./legacy-schedule-rollback-schedule";

const input = {
  keywordId: "keyword_1",
  projectId: "project_1",
  schedule: {
    frequency: "daily" as const,
    jitterMinutes: 0,
    timezone: "UTC",
  },
};

function attributes(keywordId: string, projectId = "project_1") {
  return {
    getAll: () => [
      { key: { name: "keywordId" }, value: keywordId },
      { key: { name: "projectId" }, value: projectId },
    ],
  };
}

function description(keywordId: string, projectId = "project_1") {
  const typedSearchAttributes = attributes(keywordId, projectId);
  return {
    action: {
      args: [{ keywordId }],
      typedSearchAttributes,
      workflowId: `rank-check-${keywordId}`,
      workflowType: "rankCheckWorkflow",
    },
    memo: { kind: "rank-check", keywordId, projectId },
    scheduleId: "rank-check-keyword_1",
    state: { paused: false },
    typedSearchAttributes,
  };
}

describe("paused rollback Schedule update", () => {
  it("classifies the SDK callback description and refuses a same-ID replacement", async () => {
    const update = vi.fn(async (callback) => callback(description("keyword_2")));
    const temporal = {
      create: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("exists"), { name: "ScheduleAlreadyRunning" })),
      getHandle: vi.fn(() => ({ update })),
    };

    await expect(ensurePausedRollbackScheduleWithClient(input, temporal as never)).rejects.toThrow(
      "not exact owned state",
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("refuses a self-consistent same-ID replacement for another project", async () => {
    const update = vi.fn(async (callback) => callback(description("keyword_1", "project_2")));
    const temporal = {
      create: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("exists"), { name: "ScheduleAlreadyRunning" })),
      getHandle: vi.fn(() => ({ update })),
    };

    await expect(ensurePausedRollbackScheduleWithClient(input, temporal as never)).rejects.toThrow(
      "not exact owned state",
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
