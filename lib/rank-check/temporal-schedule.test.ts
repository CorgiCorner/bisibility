import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeNextCheckAt } from "./schedule";
import {
  buildRankCheckScheduleOptions,
  buildRankCheckScheduleSpec,
  rankCheckScheduleId,
  syncRankCheckSchedule,
  syncRankCheckScheduleNonFatal,
  type TemporalScheduleClient,
  upsertRankCheckSchedule,
} from "./temporal-schedule";

function clientMock() {
  const handle = {
    delete: vi.fn(),
    update: vi.fn(),
  };
  const client = {
    create: vi.fn(),
    getHandle: vi.fn(() => handle),
  } as unknown as TemporalScheduleClient;

  return { client, handle };
}

const scheduledInput = {
  keywordId: "keyword_1",
  projectId: "project_1",
  providerId: "dataforseo",
  schedule: {
    cronExpression: null,
    frequency: "daily",
    jitterMinutes: 60,
    timezone: "Europe/Warsaw",
  },
} as const;

describe("Temporal rank-check schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  });

  it("builds a searchable stable schedule action", () => {
    const options = buildRankCheckScheduleOptions(scheduledInput);

    expect(options.scheduleId).toBe("rank-check-keyword_1");
    expect(options.action.workflowId).toBe("rank-check-keyword_1");
    expect(options.action.workflowType).toBe("rankCheckWorkflow");
    expect(options.action.args).toEqual([{ keywordId: "keyword_1", providerId: "dataforseo" }]);
    expect(options.typedSearchAttributes).toEqual([
      { key: { name: "keywordId", type: "KEYWORD" }, value: "keyword_1" },
      { key: { name: "projectId", type: "KEYWORD" }, value: "project_1" },
      { key: { name: "provider", type: "KEYWORD" }, value: "dataforseo" },
    ]);
    expect(options.action.typedSearchAttributes).toEqual(options.typedSearchAttributes);
    expect(options.policies?.overlap).toBe(ScheduleOverlapPolicy.SKIP);
  });

  it("converts built-in frequencies and custom cron to Temporal specs", () => {
    expect(buildRankCheckScheduleSpec(scheduledInput.schedule, scheduledInput.keywordId)).toEqual({
      intervals: [{ every: "1 day", offset: expect.any(Number) }],
      jitter: 3_600_000,
      timezone: "Europe/Warsaw",
    });
    expect(
      buildRankCheckScheduleSpec(
        {
          cronExpression: "15 6 * * 1",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "Europe/Warsaw",
        },
        scheduledInput.keywordId,
      ),
    ).toEqual({
      cronExpressions: ["15 6 * * 1"],
      timezone: "Europe/Warsaw",
    });
    expect(
      buildRankCheckScheduleSpec(
        { frequency: "daily", jitterMinutes: 0, timezone: "UTC" },
        scheduledInput.keywordId,
      ),
    ).not.toHaveProperty("jitter");
  });

  it("derives stable bounded daily and weekly offsets from the keyword ID", () => {
    const offsetFor = (frequency: "daily" | "weekly", keywordId: string) => {
      const spec = buildRankCheckScheduleSpec(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        keywordId,
      );
      return "intervals" in spec ? spec.intervals[0]?.offset : undefined;
    };

    const dailyOffset = offsetFor("daily", "keyword_1");
    expect(dailyOffset).toBe(offsetFor("daily", "keyword_1"));
    expect(dailyOffset).not.toBe(offsetFor("daily", "keyword_2"));
    expect(dailyOffset).toBeGreaterThanOrEqual(0);
    expect(dailyOffset).toBeLessThan(24 * 60 * 60 * 1_000);

    const weeklyOffset = offsetFor("weekly", "keyword_1");
    expect(weeklyOffset).toBe(offsetFor("weekly", "keyword_1"));
    expect(weeklyOffset).not.toBe(offsetFor("weekly", "keyword_2"));
    expect(weeklyOffset).toBeGreaterThanOrEqual(0);
    expect(weeklyOffset).toBeLessThan(7 * 24 * 60 * 60 * 1_000);
  });

  it("aligns persisted daily and weekly next times with Temporal interval phases", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    for (const [frequency, intervalMs] of [
      ["daily", 24 * 60 * 60 * 1_000],
      ["weekly", 7 * 24 * 60 * 60 * 1_000],
    ] as const) {
      const spec = buildRankCheckScheduleSpec(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        scheduledInput.keywordId,
      );
      const offset = "intervals" in spec ? spec.intervals[0]?.offset : undefined;
      const next = computeNextCheckAt(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        from,
        scheduledInput.keywordId,
      );

      expect(next).not.toBeNull();
      expect(offset).toBeDefined();
      expect((next as Date).getTime() % intervalMs).toBe(offset);
      expect(
        computeNextCheckAt(
          { frequency, jitterMinutes: 60, timezone: "UTC" },
          from,
          scheduledInput.keywordId,
        ),
      ).toEqual(next);
    }
  });

  it("converts monthly frequency to a clamped wall-clock cron spec", () => {
    expect(
      buildRankCheckScheduleSpec(
        {
          frequency: "monthly",
          jitterMinutes: 0,
          nextCheckAt: new Date("2026-01-31T06:30:00.000Z"),
          timezone: "UTC",
        },
        scheduledInput.keywordId,
      ),
    ).toEqual({
      cronExpressions: ["30 6 28 * *"],
      timezone: "UTC",
    });
  });

  it("creates a Temporal schedule when none exists", async () => {
    const { client } = clientMock();

    await expect(upsertRankCheckSchedule(scheduledInput, client)).resolves.toEqual({
      scheduleId: "rank-check-keyword_1",
      status: "created",
      workflowId: "rank-check-keyword_1",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: "rank-check-keyword_1" }),
    );
  });

  it("logs and continues when schedule sync fails", async () => {
    const { client } = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(client.create).mockRejectedValue(new Error("Temporal unavailable"));

    await expect(syncRankCheckScheduleNonFatal(scheduledInput, client)).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[temporal] rank-check schedule sync failed",
      expect.objectContaining({
        keywordId: "keyword_1",
        projectId: "project_1",
        scheduleId: "rank-check-keyword_1",
      }),
    );

    consoleError.mockRestore();
  });

  it("updates an existing schedule instead of creating a duplicate", async () => {
    const { client, handle } = clientMock();
    vi.mocked(client.create).mockRejectedValue(
      new ScheduleAlreadyRunning("already exists", "rank-check-keyword_1"),
    );

    await expect(upsertRankCheckSchedule(scheduledInput, client)).resolves.toMatchObject({
      status: "updated",
    });
    expect(client.getHandle).toHaveBeenCalledWith("rank-check-keyword_1");
    expect(handle.update).toHaveBeenCalledTimes(1);

    const updateFn = vi.mocked(handle.update).mock.calls[0][0];
    expect(updateFn({})).toMatchObject({
      action: expect.objectContaining({ workflowId: "rank-check-keyword_1" }),
      typedSearchAttributes: expect.any(Array),
    });
  });

  it("deletes the schedule for manual or paused frequencies", async () => {
    const { client, handle } = clientMock();

    await expect(
      syncRankCheckSchedule(
        {
          ...scheduledInput,
          schedule: { frequency: "manual", jitterMinutes: 0 },
        },
        client,
      ),
    ).resolves.toEqual({
      scheduleId: rankCheckScheduleId("keyword_1"),
      status: "deleted",
      workflowId: "rank-check-keyword_1",
    });
    expect(client.create).not.toHaveBeenCalled();
    expect(handle.delete).toHaveBeenCalledTimes(1);
  });

  it("treats a missing deleted schedule as already synced", async () => {
    const { client, handle } = clientMock();
    vi.mocked(handle.delete).mockRejectedValue(
      new ScheduleNotFoundError("missing", "rank-check-keyword_1"),
    );

    await expect(
      syncRankCheckSchedule(
        {
          ...scheduledInput,
          schedule: { frequency: "paused", jitterMinutes: 0 },
        },
        client,
      ),
    ).resolves.toMatchObject({ status: "missing" });
  });

  it("refuses direct owned Schedule mutation outside legacy mode", async () => {
    const { client, handle } = clientMock();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");

    await expect(upsertRankCheckSchedule(scheduledInput, client)).rejects.toThrow(
      "disabled outside legacy mode",
    );
    await expect(
      syncRankCheckSchedule(
        { ...scheduledInput, schedule: { frequency: "paused", jitterMinutes: 0 } },
        client,
      ),
    ).rejects.toThrow("disabled outside legacy mode");
    expect(client.create).not.toHaveBeenCalled();
    expect(handle.delete).not.toHaveBeenCalled();
  });
});
