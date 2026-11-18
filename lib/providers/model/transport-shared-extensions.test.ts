import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateModelResponse, readModelMetadata, readModelMetadataPages } from "./transport";
import {
  assertNoUnexpectedFetch,
  generation,
  interceptedFetch,
  json,
  request,
} from "./transport.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetchMock = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

it("delivers lossless money to the adapter and preserves optional evidence through settlement", async () => {
  const config = generation();
  config.jsonOptions = { moneyPaths: [["usage", "cost"]] };
  const evidence = {
    ...result(),
    consultedSources: { sources: [], total: null, omitted: null, truncated: false },
    citationTotals: { total: null, omitted: null },
    costEvidence: { providerReported: null, upstreamInference: null, localEstimate: null },
  };
  config.normalize = vi.fn(() => evidence);
  fetchMock.mockResolvedValueOnce(
    json('{"usage":{"cost":0.1234567890123456789012345,"tokens":4}}'),
  );
  expect(await generateModelResponse(config)).toMatchObject({
    column: evidence.column,
    citations: evidence.citations,
    usage: evidence.usage,
    consultedSources: evidence.consultedSources,
    citationTotals: evidence.citationTotals,
    costEvidence: evidence.costEvidence,
  });
  expect(config.normalize).toHaveBeenCalledExactlyOnceWith({
    body: { usage: { cost: "0.1234567890123456789012345", tokens: 4 } },
    requestId: null,
  });
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
    config.operationKey,
    expect.objectContaining({
      consultedSources: evidence.consultedSources,
      costEvidence: evidence.costEvidence,
      citationTotals: evidence.citationTotals,
    }),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("uses the monetary opt-in on free metadata without enabling another route", async () => {
  fetchMock.mockResolvedValueOnce(json('{"price":0.00000000000000000000001,"count":7}'));
  expect(
    (await readModelMetadata({ ...request(), jsonOptions: { moneyPaths: [["price"]] } })).body,
  ).toEqual({ price: "0.00000000000000000000001", count: 7 });
});

it.each(["1e309", "NaN", "1".repeat(257)])(
  "settles rejected monetary literal as unknown without retries: %s",
  async (literal) => {
    const config = generation();
    config.jsonOptions = { moneyPaths: [["cost"]] };
    fetchMock.mockResolvedValueOnce(json(`{"cost":${literal}}`));
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
    });
    expect(config.normalize).not.toHaveBeenCalled();
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
      config.operationKey,
      expect.objectContaining({
        state: "unknown",
        providerCost: expect.objectContaining({ amount: null }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

it("rejects a page larger than the requested limit", async () => {
  fetchMock.mockResolvedValueOnce(
    json(
      '{"data":[{"id":"model-1"},{"id":"model-2"}],"first_id":"model-1","last_id":"model-2","has_more":false}',
    ),
  );
  await expect(
    readModelMetadataPages({ ...request(), providerId: "anthropic", page: { limit: 1 } }),
  ).rejects.toMatchObject({ code: "invalid_response" });
});

it("cannot mark a traversal starting after an unknown prefix as complete", async () => {
  await expect(
    readModelMetadataPages({
      ...request(),
      providerId: "anthropic",
      page: { afterId: "model-1" },
    } as never),
  ).rejects.toMatchObject({ code: "invalid_request" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("bounds aggregate decoded bytes even when wire compression is tiny", async () => {
  const body =
    '{"data":[{"id":"model-1"}],"first_id":"model-1","last_id":"model-1","has_more":true}';
  fetchMock
    .mockResolvedValueOnce(
      json(body, { headers: { "content-encoding": "gzip", "content-length": "10" } }),
    )
    .mockResolvedValueOnce(
      json(body.replaceAll("model-1", "model-2"), {
        headers: { "content-encoding": "gzip", "content-length": "10" },
      }),
    );
  await expect(
    readModelMetadataPages({ ...request(), providerId: "anthropic", maxResponseBytes: 120 }),
  ).rejects.toMatchObject({ code: "invalid_response" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["openai", "anthropic", "openrouter", "vercel_ai_gateway"] as const)(
  "leaves results without routing/discard evidence unchanged for %s",
  async (providerId) => {
    const config = generation();
    config.providerId = providerId;
    config.column.providerId = providerId;
    const legacy = { ...result(), column: config.column };
    config.normalize = () => legacy;
    fetchMock.mockResolvedValueOnce(json());
    const response = await generateModelResponse(config);
    expect(response).toEqual({
      ...legacy,
      providerRequestId: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    expect(response).not.toHaveProperty("routingAttemptCredentials");
    expect(response.costEvidence).toBeUndefined();
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
  },
);
