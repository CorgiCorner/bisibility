import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { catalogFromPage, probe } from "./catalog";
import { canary, catalogFixture, context } from "./fixtures.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

it("intersects exact metadata IDs with fixtures and does not advertise temperature", () => {
  const catalog = catalogFromPage(catalogFixture(), context().accountDigest);
  expect(modelCatalogSnapshotSchema.safeParse(catalog).success).toBe(true);
  expect(catalog.models).toHaveLength(1);
  expect(catalog.models[0]).toMatchObject({
    modelId: "claude-opus-5-5",
    temperature: false,
    maxOutputTokens: 4096,
    availability: "fixture_verified",
    search: [{ mode: "anthropic_web_search_20250305", maxCalls: 10, countryHint: true }],
  });
  expect(Date.parse(catalog.expiresAt) - Date.parse(catalog.fetchedAt)).toBe(300000);
});
it("does not infer tool version support from metadata on an unfixtureed model", () => {
  const page = catalogFixture();
  page.data[0].id = "claude-opus-5";
  page.first_id = page.last_id = "claude-opus-5";
  expect(catalogFromPage(page, context().accountDigest).models).toEqual([]);
});
it("omits search when metadata explicitly disables it", () => {
  const page = catalogFixture();
  page.data[0].capabilities.server_tools.web_search.supported = false;
  expect(catalogFromPage(page, context().accountDigest).models[0].search).toEqual([]);
});
it.each(["before", "after"])(
  "keeps a terminal catalog available with an unrelated null-limit model %s the selected model",
  async (position) => {
    const page = catalogFixture();
    const unrelated = { ...page.data[0], id: "unreviewed-model", max_tokens: null };
    const data = position === "before" ? [unrelated, ...page.data] : [...page.data, unrelated];
    network.mockResolvedValueOnce(
      json(JSON.stringify({ ...page, data, first_id: data[0].id, last_id: data.at(-1)?.id })),
    );
    const probeContext = context();
    const result = await probe(probeContext);
    expect(result.state).toBe("catalog_available");
    expect(result.catalog?.models).toEqual(catalogFromPage(page, context().accountDigest).models);
    expect(modelCatalogSnapshotSchema.safeParse(result.catalog).success).toBe(true);
    expect(network).toHaveBeenCalledOnce();
  },
);
it.each([null, undefined])(
  "retains the reviewed application bound for a selected unknown limit %s",
  (max_tokens) => {
    const page = catalogFixture();
    const selected: Record<string, unknown> = { ...page.data[0] };
    if (max_tokens === undefined) delete selected.max_tokens;
    else selected.max_tokens = max_tokens;
    const models = catalogFromPage({ ...page, data: [selected] }, context().accountDigest).models;
    expect(models).toEqual(catalogFromPage(page, context().accountDigest).models);
    expect(models[0]).toMatchObject({
      maxOutputTokens: 4096,
      availability: "fixture_verified",
    });
  },
);
it.each([
  [16, 16],
  [2048, 2048],
  [4096, 4096],
  [131072, 4096],
])("clamps numeric metadata limit %s to %s", (max_tokens, expected) => {
  const page = catalogFixture();
  page.data[0].max_tokens = max_tokens;
  expect(catalogFromPage(page, context().accountDigest).models[0].maxOutputTokens).toBe(expected);
});
it.each([0, -1, 1.5, "4096", true, {}, [], Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects malformed selected limits while counting unrecognized unrelated limits %j",
  async (max_tokens) => {
    const page = catalogFixture();
    for (const id of [page.data[0].id, "unreviewed-model"]) {
      const data =
        id === page.data[0].id
          ? [{ ...page.data[0], max_tokens }]
          : [...page.data, { ...page.data[0], id, max_tokens }];
      const body = { ...page, data, last_id: id };
      if (id === page.data[0].id)
        expect(() => catalogFromPage(body, context().accountDigest)).toThrow(
          new ModelTransportError("invalid_response"),
        );
      else
        expect(catalogFromPage(body, context().accountDigest).recognition).toMatchObject({
          recognition: "partial",
          skippedEntries: 1,
        });
      // Non-finite values cannot be JSON numbers; send the corresponding invalid token.
      const wire = JSON.stringify(body).replace('"max_tokens":null', `"max_tokens":${max_tokens}`);
      network.mockResolvedValueOnce(json(wire));
      const value = await probe(context());
      expect(value.state).toBe(
        id === page.data[0].id || (!Number.isFinite(max_tokens) && typeof max_tokens === "number")
          ? "unavailable"
          : "catalog_available",
      );
    }
    expect(network).toHaveBeenCalledTimes(2);
  },
);
it.each(["missing-cursor", "repeated-cursor", "oversized", "malformed", "empty-nonterminal"])(
  "fails closed on incomplete/invalid catalog %s with exactly one network call",
  async (scenario) => {
    let page: unknown = catalogFixture();
    if (scenario === "missing-cursor") page = { ...catalogFixture(), last_id: null };
    if (scenario === "repeated-cursor")
      page = { ...catalogFixture(), data: [catalogFixture().data[0], catalogFixture().data[0]] };
    if (scenario === "oversized")
      page = {
        ...catalogFixture(),
        data: Array.from({ length: 1001 }, () => catalogFixture().data[0]),
      };
    if (scenario === "malformed") page = { data: `${canary}`, error: canary };
    if (scenario === "empty-nonterminal")
      page = { data: [], has_more: true, first_id: null, last_id: null };
    network.mockResolvedValueOnce(json(JSON.stringify(page)));
    expect(await probe(context())).toEqual({ state: "unavailable", catalog: null });
    expect(network).toHaveBeenCalledOnce();
  },
);
it("distinguishes a terminal empty catalog from failure without paid fallback", async () => {
  network.mockResolvedValueOnce(
    json(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null })),
  );
  expect(await probe(context())).toEqual({ state: "no_supported_models", catalog: null });
  expect(network).toHaveBeenCalledOnce();
});
it.each([
  [401, "invalid_credentials"],
  [403, "refused"],
  [429, "rate_limited"],
  [500, "provider_error"],
] as const)("classifies metadata HTTP %s safely and never retries", async (status, code) => {
  network.mockResolvedValueOnce(json(JSON.stringify({ error: canary }), { status }));
  expect(await probe(context())).toEqual({
    state: code === "invalid_credentials" ? "invalid_key" : "unavailable",
    catalog: null,
  });
  expect(network).toHaveBeenCalledOnce();
});
// Synthetic boundary values for the product's minimum runnable output budget.
it.each([1, 15, 16, null])(
  "offers a usable catalog only for effective limits at least 16: %s",
  async (max_tokens) => {
    const page = catalogFixture();
    const body = { ...page, data: [{ ...page.data[0], max_tokens }] };
    network.mockResolvedValueOnce(json(JSON.stringify(body)));
    const result = await probe(context());
    const usable = max_tokens === null || max_tokens >= 16;
    expect(result.state).toBe(usable ? "catalog_available" : "no_supported_models");
    expect(result.catalog?.models[0]?.maxOutputTokens ?? null).toBe(
      usable ? (max_tokens ?? 4096) : null,
    );
    expect(catalogFromPage(body, context().accountDigest).models).toHaveLength(usable ? 1 : 0);
    expect(network).toHaveBeenCalledOnce();
  },
);
