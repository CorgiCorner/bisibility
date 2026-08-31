import { ApplicationFailure } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderAuthError } from "../providers/auth-error";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import {
  markSearchInsightsImportFailedActivity,
  runSearchInsightsBackfillBatchActivity,
  runSearchInsightsIncrementalActivity,
  runSearchInsightsIncrementalForAllActivity,
} from "./search-insights-activities";
import {
  SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
  SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
} from "./search-insights-contract";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  heartbeat: vi.fn(),
  incremental: vi.fn(),
  incrementalForAll: vi.fn(),
  markImportFailed: vi.fn(),
  runBackfillBatch: vi.fn(),
  runOrganicSessionsBackfillBatch: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({ Context: { current: mocks.current } }));
vi.mock("../search-insights/sync/backfill", () => ({ runBackfillBatch: mocks.runBackfillBatch }));
vi.mock("../search-insights/sync/sessions-backfill", () => ({
  runOrganicSessionsBackfillBatch: mocks.runOrganicSessionsBackfillBatch,
}));
vi.mock("../search-insights/sync/import-state", () => ({
  markImportFailed: mocks.markImportFailed,
}));
vi.mock("../search-insights/sync/incremental", () => ({
  runIncrementalForAllProjects: mocks.incrementalForAll,
  runIncrementalSync: mocks.incremental,
}));

const input = { projectId: "project_1", property: "sc-domain:example.com" };

describe("search insights activities", () => {
  let controller: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AbortController();
    mocks.current.mockReturnValue({
      cancellationSignal: controller.signal,
      cancelled: new Promise(() => undefined),
      heartbeat: mocks.heartbeat,
    });
  });

  it("heartbeats while a day partition is in flight", async () => {
    mocks.runBackfillBatch.mockResolvedValue({
      blocked: false,
      daysProcessed: 7,
      done: false,
      nextCursor: "2026-07-01",
    });

    await expect(runSearchInsightsBackfillBatchActivity(input)).resolves.toEqual({
      blocked: false,
      daysProcessed: 7,
      done: false,
      nextCursor: "2026-07-01",
    });
    expect(mocks.runBackfillBatch).toHaveBeenCalledWith(input, { signal: controller.signal });
    expect(mocks.heartbeat).toHaveBeenCalledWith({ phase: "backfill", projectId: "project_1" });
  });

  it("dispatches a sessions source to its range backfill runner", async () => {
    mocks.runOrganicSessionsBackfillBatch.mockResolvedValue({
      blocked: false,
      daysProcessed: 30,
      done: false,
      nextCursor: "2026-06-08",
    });
    const sessionsInput = { projectId: "project_1", property: "123456789", source: "ga4" as const };

    await runSearchInsightsBackfillBatchActivity(sessionsInput);

    expect(mocks.runOrganicSessionsBackfillBatch).toHaveBeenCalledWith(sessionsInput, {
      signal: controller.signal,
    });
    expect(mocks.runBackfillBatch).not.toHaveBeenCalled();
  });

  it("still runs when called outside an activity, so the module stays testable", async () => {
    mocks.current.mockImplementation(() => {
      throw new Error("not in an activity");
    });
    mocks.runBackfillBatch.mockResolvedValue({
      blocked: false,
      daysProcessed: 0,
      done: true,
      nextCursor: null,
    });

    await expect(runSearchInsightsBackfillBatchActivity(input)).resolves.toMatchObject({
      done: true,
    });
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("ends a cancelled attempt instead of letting it race its own retry", async () => {
    const cancelled = Promise.reject(new Error("activity cancelled"));
    cancelled.catch(() => undefined);
    mocks.current.mockReturnValue({
      cancellationSignal: controller.signal,
      cancelled,
      heartbeat: mocks.heartbeat,
    });
    mocks.runBackfillBatch.mockImplementation(async () => {
      controller.abort();
      return { blocked: false, daysProcessed: 3, done: false, nextCursor: "2026-07-01" };
    });

    // A start-to-close timeout has already started attempt two; returning a result here would
    // let this attempt keep writing beside it.
    await expect(runSearchInsightsBackfillBatchActivity(input)).rejects.toThrow(
      "activity cancelled",
    );
  });

  it("turns a quota refusal into a named failure the workflow waits on", async () => {
    mocks.runBackfillBatch.mockRejectedValue(new ProviderRateLimitedError("gsc"));

    const failure = await runSearchInsightsBackfillBatchActivity(input).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({
      nonRetryable: true,
      type: SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
    });
  });

  it("turns a lost authorization into a named failure the workflow stops for", async () => {
    mocks.runBackfillBatch.mockRejectedValue(new ProviderAuthError("gsc"));

    const failure = await runSearchInsightsBackfillBatchActivity(input).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      nonRetryable: true,
      type: SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
    });
  });

  it("lets an unexpected failure reach Temporal's own retry policy unchanged", async () => {
    const unexpected = new Error("connection lost");
    mocks.runBackfillBatch.mockRejectedValue(unexpected);

    await expect(runSearchInsightsBackfillBatchActivity(input)).rejects.toBe(unexpected);
  });

  it("runs one project's incremental sync", async () => {
    mocks.incremental.mockResolvedValue({
      daysProcessed: 1,
      projectId: "project_1",
      status: "synced",
    });

    await expect(
      runSearchInsightsIncrementalActivity({ projectId: "project_1" }),
    ).resolves.toMatchObject({ status: "synced" });
    expect(mocks.heartbeat).toHaveBeenCalledWith({
      phase: "incremental",
      projectId: "project_1",
    });
  });

  it("classifies a quota refusal from the whole-instance sweep too", async () => {
    mocks.incremental.mockRejectedValue(new ProviderRateLimitedError("gsc"));

    await expect(
      runSearchInsightsIncrementalActivity({ projectId: "project_1" }),
    ).rejects.toMatchObject({ type: SEARCH_INSIGHTS_RATE_LIMITED_FAILURE });
  });

  it("sweeps every connected project in one activity", async () => {
    mocks.incrementalForAll.mockResolvedValue({ projects: [] });

    await expect(runSearchInsightsIncrementalForAllActivity()).resolves.toEqual({ projects: [] });
    expect(mocks.incrementalForAll).toHaveBeenCalledWith(expect.any(Date));
  });

  it("records the terminal state when the workflow gives up", async () => {
    await expect(markSearchInsightsImportFailedActivity(input)).resolves.toBeUndefined();

    expect(mocks.markImportFailed).toHaveBeenCalledWith("project_1", "sc-domain:example.com");
  });
});
