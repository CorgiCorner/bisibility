import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAIModelProvider } from "./adapter";
import { context } from "./adapter.test-support";

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
const list = (ids: string[]) => ({
  object: "list",
  data: ids.map((id) => ({ id, object: "model", owned_by: "synthetic" })),
});

describe("explicit metadata probe", () => {
  it("performs no import-time I/O", async () => {
    vi.resetModules();
    await import("./adapter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("intersects exact returned IDs without quote, generation or entitlement inference", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        JSON.stringify(
          list([
            "gpt-4.1",
            "gpt-4.1",
            "gpt-5-2025-08-07",
            "gpt-4.1-new",
            "gpt-5-image",
            "gpt-6-astra",
          ]),
        ),
      ),
    );
    const result = await openAIModelProvider.probe(context());
    expect(result.state).toBe("catalog_available");
    expect(result.catalog?.models.map((entry) => entry.modelId)).toEqual([
      "gpt-4.1",
      "gpt-5-2025-08-07",
    ]);
    expect(result.catalog?.models.map((entry) => entry.temperature)).toEqual([true, false]);
    expect(modelCatalogSnapshotSchema.parse(JSON.parse(JSON.stringify(result.catalog)))).toEqual(
      result.catalog,
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(context().apiKey);
  });

  it.each([
    [401, "invalid_key"],
    [403, "unavailable"],
    [429, "unavailable"],
    [500, "unavailable"],
    [503, "unavailable"],
  ])("maps %i safely without retries", async (status, state) => {
    fetchMock.mockResolvedValueOnce(
      json(JSON.stringify({ error: context().apiKey }), { status: Number(status) }),
    );
    expect(await openAIModelProvider.probe(context())).toEqual({ state, catalog: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ ids: [] }, { ids: ["gpt-4.1-future", "gpt-5-suffix"] }])(
    "reports no curated text IDs for %j",
    async ({ ids }) => {
      fetchMock.mockResolvedValueOnce(json(JSON.stringify(list(ids))));
      expect(await openAIModelProvider.probe(context())).toEqual({
        state: "no_supported_models",
        catalog: null,
      });
    },
  );

  it.each([
    {},
    { object: "list", data: [{ id: "bad\nmodel", object: "model" }] },
    { object: "list", data: "echo" },
  ])("does not promote malformed metadata", async (body) => {
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(body)));
    expect(await openAIModelProvider.probe(context())).toEqual({
      state: "unavailable",
      catalog: null,
    });
  });
});
