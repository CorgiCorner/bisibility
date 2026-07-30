import { chunkQueuedRankCheckGroup } from "@/lib/rank-check/queued-batches";
import { QUEUED_RESULT_GET_TIMEOUT_MS } from "@/lib/rank-check/queued-timeouts";
import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataForSeoError } from "./dataforseo-errors";
import {
  DataForSeoAmbiguousSubmissionError,
  dataForSeoQueuedTaskTag,
  fetchDataForSeoQueuedResult,
  readyDataForSeoQueuedTasks,
  submitDataForSeoQueuedTasks,
} from "./dataforseo-queued";

function location(): SerpRankLocation {
  return {
    gl: "us",
    hl: "en",
    primaryGeoCode: 2840,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  };
}

function tasks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    correlationId: `correlation_${index + 1}`,
    depth: 100 as const,
    device: "desktop" as const,
    domain: "example.com",
    keyword: `keyword text ${index + 1}`,
    location: location(),
    stopOnMatch: true,
  }));
}

function createdEnvelope(count: number) {
  return {
    cost: count * 0.012,
    status_code: 20000,
    tasks: Array.from({ length: count }, (_, index) => ({
      cost: 0.012,
      data: { tag: dataForSeoQueuedTaskTag(`correlation_${index + 1}`) },
      id: `provider_${index + 1}`,
      status_code: 20100,
      status_message: "Task Created.",
    })),
  };
}

describe("DataForSEO queued tasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts exactly 100 high-priority tasks in one request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(createdEnvelope(100)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitDataForSeoQueuedTasks({
      credentials: { login: "login", password: "password" },
      priority: "high",
      tasks: tasks(100),
    });

    expect(result.accepted).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(100);
    expect(body[0]).toMatchObject({
      depth: 100,
      priority: 2,
      tag: "bisibility:rank:correlation_1",
    });
  });

  it("rejects oversized requests before making a paid call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitDataForSeoQueuedTasks({
        credentials: { login: "login", password: "password" },
        priority: "high",
        tasks: tasks(101),
      }),
    ).rejects.toThrow("at most 100");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the stored stop-on-match setting in queued payloads", async () => {
    const task = tasks(1)[0];
    if (!task) throw new Error("Expected one task fixture.");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(createdEnvelope(1)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitDataForSeoQueuedTasks({
      credentials: { login: "login", password: "password" },
      priority: "high",
      tasks: [{ ...task, stopOnMatch: false }],
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body[0]).not.toHaveProperty("stop_crawl_on_match");
    expect(body[0]).not.toHaveProperty("find_targets_in");
  });

  it("turns 101 deterministic keywords into paid requests of 100 and 1", async () => {
    const allTasks = tasks(101);
    const chunks = chunkQueuedRankCheckGroup({
      claimedAt: "2026-07-29T00:00:00.000Z",
      device: "desktop",
      keywordIds: allTasks.map((task) => task.correlationId),
      locationId: "location_1",
      projectId: "project_1",
    });
    const byId = new Map(allTasks.map((task) => [task.correlationId, task]));
    const requestSizes: number[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Array<{ tag: string }>;
      requestSizes.push(body.length);
      return new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: body.map((task, index) => ({
            cost: 0.012,
            data: { tag: task.tag },
            id: `provider_${requestSizes.length}_${index}`,
            status_code: 20100,
          })),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    for (const chunk of chunks) {
      await submitDataForSeoQueuedTasks({
        credentials: { login: "login", password: "password" },
        priority: "high",
        tasks: chunk.keywordIds.map((id) => {
          const task = byId.get(id);
          if (!task) throw new Error(`Missing task fixture ${id}.`);
          return task;
        }),
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestSizes).toEqual([100, 1]);
  });

  it("does not expose keyword text in deterministic correlation tags", () => {
    expect(dataForSeoQueuedTaskTag("task_123")).toBe("bisibility:rank:task_123");
  });

  it("recovers accepted task ids from the ready endpoint by deterministic tag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [
            {
              result: [
                { id: "provider_1", tag: "bisibility:rank:task_1" },
                { id: "provider_other", tag: "unrelated" },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readyDataForSeoQueuedTasks(
        { login: "login", password: "password" },
        new Set(["bisibility:rank:task_1"]),
      ),
    ).resolves.toEqual([{ providerTaskId: "provider_1", tag: "bisibility:rank:task_1" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("propagates caller cancellation to the queued readiness GET", async () => {
    const controller = new AbortController();
    const cancellation = new Error("inspection cancelled");
    let observedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_url: string, request: RequestInit) => {
      observedSignal = request.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = readyDataForSeoQueuedTasks(
      { login: "login", password: "password" },
      new Set(["bisibility:rank:task_1"]),
      { signal: controller.signal },
    );
    const rejection = expect(result).rejects.toBe(cancellation);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
    await rejection;
  });

  it("classifies a lost POST response as ambiguous without a second paid call", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitDataForSeoQueuedTasks({
        credentials: { login: "login", password: "password" },
        priority: "high",
        tasks: tasks(1),
      }),
    ).rejects.toBeInstanceOf(DataForSeoAmbiguousSubmissionError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves a positive cost from a failed queued result envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            cost: 0.024,
            status_code: 40501,
            status_message: "Queued task failed.",
          }),
          { status: 200 },
        ),
      ),
    );

    const error = await fetchDataForSeoQueuedResult(
      { login: "login", password: "password" },
      "provider_1",
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(DataForSeoError);
    expect(error).toMatchObject({ costCents: 2.4, retryable: false });
  });

  it("gives a never-settling queued result GET a local abort signal", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_url: string, request: RequestInit) => {
      observedSignal = (request.signal as AbortSignal | undefined) ?? null;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchDataForSeoQueuedResult(
      { login: "login", password: "password" },
      "provider_never_settles",
    );
    const rejection = expect(result).rejects.toMatchObject({ retryable: true });
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(QUEUED_RESULT_GET_TIMEOUT_MS);

    await rejection;
    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  it("propagates caller cancellation to the queued result GET", async () => {
    const controller = new AbortController();
    const cancellation = new Error("activity cancelled");
    let observedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_url: string, request: RequestInit) => {
      observedSignal = request.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = (
      fetchDataForSeoQueuedResult as (
        credentials: { login: string; password: string },
        providerTaskId: string,
        options: { signal: AbortSignal },
      ) => Promise<unknown>
    )({ login: "login", password: "password" }, "provider_cancelled", {
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toBe(cancellation);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
    await rejection;
  });
});
