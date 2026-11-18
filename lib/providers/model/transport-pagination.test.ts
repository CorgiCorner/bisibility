import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readModelMetadata, readModelMetadataPages } from "./transport";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
  request,
  streamResponse,
} from "./transport.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let fetchMock: ReturnType<typeof interceptedFetch>;
const config = () => ({ ...request(), providerId: "anthropic" as const, page: { limit: 2 } });
const page = (ids: string[], more = false) =>
  json(
    JSON.stringify({
      data: ids.map((id) => ({ id })),
      first_id: ids[0] ?? null,
      last_id: ids.at(-1) ?? null,
      has_more: more,
    }),
  );
beforeEach(() => {
  fetchMock = interceptedFetch();
  vi.mocked(consumeProviderLimit).mockClear();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("encodes only the typed cursor/limit on the existing metadata route", async () => {
  fetchMock.mockResolvedValueOnce(page(["model-2"]));
  await readModelMetadata({ ...config(), page: { afterId: "model-1", limit: 2 } });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.anthropic.com/v1/models?after_id=model-1&limit=2",
  );
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
});

it("returns a complete catalog only after terminal multi-page traversal", async () => {
  fetchMock
    .mockResolvedValueOnce(page(["model-1", "model-2"], true))
    .mockResolvedValueOnce(page(["model-3"]));
  const completed = await readModelMetadataPages(config());
  expect(completed).toEqual({
    completeness: "complete",
    models: [{ id: "model-1" }, { id: "model-2" }, { id: "model-3" }],
    pageCount: 2,
  });
  expect(fetchMock.mock.calls[1][0]).toBe(
    "https://api.anthropic.com/v1/models?after_id=model-2&limit=2",
  );
  expect(consumeProviderLimit).toHaveBeenCalledTimes(2);
});

it.each(["repeated", "cycle", "empty", "duplicate-model", "wrong-last"])(
  "rejects %s cursors/pages without returning partial metadata",
  async (kind) => {
    fetchMock.mockResolvedValueOnce(page(["model-1"], true));
    if (kind === "repeated") fetchMock.mockResolvedValueOnce(page(["model-1"], true));
    if (kind === "cycle")
      fetchMock
        .mockResolvedValueOnce(page(["model-2"], true))
        .mockResolvedValueOnce(page(["model-1"], true));
    if (kind === "duplicate-model") fetchMock.mockResolvedValueOnce(page(["model-1", "model-2"]));
    if (kind === "empty")
      fetchMock.mockResolvedValueOnce(
        json('{"data":[],"first_id":null,"last_id":"","has_more":true}'),
      );
    if (kind === "wrong-last")
      fetchMock.mockResolvedValueOnce(
        json(
          '{"data":[{"id":"model-2"}],"first_id":"model-2","last_id":"model-3","has_more":true}',
        ),
      );
    await expect(readModelMetadataPages(config())).rejects.toMatchObject({
      code: "invalid_response",
      message: "Model provider returned an invalid response.",
      dispatched: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(kind === "cycle" ? 3 : 2);
  },
);

it.each(["page", "model", "bytes", "deadline"])("enforces the aggregate %s limit", async (kind) => {
  if (kind === "page") {
    for (let i = 1; i <= 5; i++) fetchMock.mockResolvedValueOnce(page([`model-${i}`], true));
  } else if (kind === "model") {
    fetchMock
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 600 }, (_, i) => `model-${i}`),
          true,
        ),
      )
      .mockResolvedValueOnce(page(Array.from({ length: 401 }, (_, i) => `model-${600 + i}`)));
  } else if (kind === "bytes") {
    const first =
      '{"data":[{"id":"model-1"}],"first_id":"model-1","last_id":"model-1","has_more":true}';
    fetchMock
      .mockResolvedValueOnce(json(first))
      .mockResolvedValueOnce(
        streamResponse([new TextEncoder().encode(first.replaceAll("model-1", "model-2"))]).response,
      );
  } else {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(6);
      return page(["model-1"], true);
    });
    fetchMock.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(6);
      return page(["model-2"]);
    });
  }
  await expect(
    readModelMetadataPages({
      ...config(),
      page: { limit: 1000 },
      ...(kind === "bytes" ? { maxResponseBytes: 120 } : {}),
      ...(kind === "deadline" ? { timeoutMs: 10 } : {}),
    }),
  ).rejects.toMatchObject({
    code: kind === "deadline" ? "timeout" : "invalid_response",
    dispatched: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(kind === "page" ? 5 : 2);
});

it.each([
  { page: { afterId: "" } },
  { page: { afterId: "x?limit=9" } },
  { page: { afterId: "a/../b" } },
  { page: { limit: 1001 } },
  { page: { limit: 0 } },
  { page: { query: "evil" } },
  { providerId: "openai" },
  { headers: { extra: "evil" } },
])("rejects forged pagination options before I/O", async (changes) => {
  await expect(readModelMetadataPages({ ...config(), ...changes } as never)).rejects.toMatchObject({
    code: "invalid_request",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not retry a failed later page or return a complete prefix", async () => {
  fetchMock
    .mockResolvedValueOnce(page(["model-1"], true))
    .mockResolvedValueOnce(json(undefined, { status: 503 }));
  await expect(readModelMetadataPages(config())).rejects.toMatchObject({ code: "provider_error" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["", "x?limit=9", "a/../b", "a&b", "x\n", "a".repeat(257)])(
  "rejects an unsafe single-page cursor before I/O: %s",
  async (afterId) => {
    await expect(readModelMetadata({ ...config(), page: { afterId } })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it.each([1, 5])("accepts exactly 1000 models over %s terminal pages", async (pages) => {
  for (let i = 0; i < pages; i++) {
    const ids = Array.from(
      { length: 1000 / pages },
      (_, index) => `model-${i * (1000 / pages) + index}`,
    );
    fetchMock.mockResolvedValueOnce(page(ids, i < pages - 1));
  }
  const completed = await readModelMetadataPages({ ...config(), page: { limit: 1000 } });
  expect(completed.models).toHaveLength(1000);
  expect(completed.pageCount).toBe(pages);
  expect(fetchMock).toHaveBeenCalledTimes(pages);
});

it("accepts a terminal empty catalog and refuses an exhausted nonterminal model budget", async () => {
  fetchMock.mockResolvedValueOnce(page([]));
  expect(await readModelMetadataPages(config())).toEqual({
    completeness: "complete",
    models: [],
    pageCount: 1,
  });
  fetchMock.mockResolvedValueOnce(
    page(
      Array.from({ length: 1000 }, (_, i) => `model-${i}`),
      true,
    ),
  );
  await expect(
    readModelMetadataPages({ ...config(), page: { limit: 1000 } }),
  ).rejects.toMatchObject({ code: "invalid_response" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
