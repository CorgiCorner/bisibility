import { catalog, digest, entry } from "@/lib/model-playground/contract-fixtures.test-support";
import { MODEL_PLAYGROUND_LIMITS, modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MODEL_CATALOG_CACHE_LIMITS, ModelCatalogCache } from "./catalog-cache";
import type { ModelCatalogSnapshot } from "./types";

const scope = {
  providerId: "openrouter" as const,
  accountDigest: digest,
  credentialRevision: "b".repeat(64),
};
const snapshot = () =>
  catalog({
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function poisonStoredJson(cache: ModelCatalogCache, json: string) {
  // Simulate stale/corrupt serialized storage without adding a production injection port.
  const entries = Reflect.get(cache, "entries") as Map<string, { json: string }>;
  const stored = entries.values().next().value;
  if (!stored) throw new Error("Missing cached fixture");
  stored.json = json;
}

const mutations: { name: string; change(value: ModelCatalogSnapshot): unknown }[] = [
  { name: "foreign account", change: (value) => ({ ...value, accountDigest: "c".repeat(64) }) },
  {
    name: "foreign provider",
    change: (value) => catalog({ ...value, providerId: "openai", models: [] }),
  },
  {
    name: "future fetch time",
    change: (value) => ({ ...value, fetchedAt: new Date(Date.now() + 1).toISOString() }),
  },
  {
    name: "expired snapshot",
    change: (value) => ({
      ...value,
      fetchedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date().toISOString(),
    }),
  },
  {
    name: "expired fetch TTL",
    change: (value) => ({
      ...value,
      fetchedAt: new Date(Date.now() - MODEL_CATALOG_CACHE_LIMITS.ttlMs).toISOString(),
    }),
  },
  {
    name: "unknown secret field",
    change: (value) => ({ ...value, apiKey: "SYNTHETIC-CACHE-CANARY" }),
  },
  { name: "non-native provider", change: (value) => ({ ...value, providerId: "dataforseo" }) },
  {
    name: "consumer source",
    change: (value) => ({
      ...value,
      models: [{ ...value.models[0], sourceKind: "consumer_capture" }],
    }),
  },
  {
    name: "unbounded documentation",
    change: (value) => ({
      ...value,
      models: [
        entry({
          text: {
            ...entry().text,
            documentationUrl: `https://example.org/${"x".repeat(MODEL_PLAYGROUND_LIMITS.documentationUrlCharacters)}`,
          },
        }),
      ],
    }),
  },
  {
    name: "insecure documentation",
    change: (value) => ({
      ...value,
      models: [entry({ text: { ...entry().text, documentationUrl: "http://example.org/docs" } })],
    }),
  },
  {
    name: "credentialed search documentation",
    change: (value) => ({
      ...value,
      models: [
        entry({
          search: [
            {
              ...entry().search[0],
              evidence: {
                ...entry().text,
                documentationUrl: "https://user:pass@example.com/docs",
              },
            },
          ],
        }),
      ],
    }),
  },
];

it.each(mutations)("validates parsed cache reads and evicts $name", ({ change }) => {
  const cache = new ModelCatalogCache();
  cache.set(scope, snapshot());
  poisonStoredJson(cache, JSON.stringify(change(snapshot())));
  expect(cache.get(scope)).toBeNull();
  expect(cache.get(scope)).toBeNull();
  cache.set(scope, snapshot());
  expect(cache.get(scope)).toEqual(snapshot());
});

it("evicts invalid JSON as a cache miss without exposing raw parser errors", () => {
  const cache = new ModelCatalogCache();
  cache.set(scope, snapshot());
  poisonStoredJson(cache, '{"apiKey":"SYNTHETIC-CACHE-CANARY"');
  expect(cache.get(scope)).toBeNull();
  expect(cache.get(scope)).toBeNull();
});

it("retains the stricter storage byte cap on both writes and parsed reads", () => {
  const cache = new ModelCatalogCache();
  const large = snapshot();
  large.models = Array.from({ length: 600 }, (_, index) =>
    entry({
      modelId: `vendor/model-${index}`,
      text: { ...entry().text, documentationUrl: `https://example.org/${"x".repeat(600)}` },
    }),
  );
  const json = JSON.stringify(large);
  expect(modelCatalogSnapshotSchema.safeParse(large).success).toBe(true);
  expect(Buffer.byteLength(json)).toBeGreaterThan(MODEL_CATALOG_CACHE_LIMITS.entryBytes);
  expect(Buffer.byteLength(json)).toBeLessThan(MODEL_PLAYGROUND_LIMITS.catalogBytes);
  expect(() => cache.set(scope, large)).toThrow("invalid response");
  cache.set(scope, snapshot());
  poisonStoredJson(cache, json);
  expect(cache.get(scope)).toBeNull();
});

it.each(mutations)("applies current contract on cache writes: $name", ({ change }) => {
  const cache = new ModelCatalogCache();
  expect(() => cache.set(scope, change(snapshot()) as ModelCatalogSnapshot)).toThrow(
    "invalid response",
  );
  expect(cache.get(scope)).toBeNull();
});

it("preserves curated documentation and hashed credential scope without retaining keys", () => {
  const cache = new ModelCatalogCache();
  const value = snapshot();
  cache.set(scope, value);
  expect(cache.get(scope)?.models[0].text).toEqual(entry().text);
  expect(cache.get({ ...scope, credentialRevision: "d".repeat(64) })).toBeNull();
  expect(cache.get({ ...scope, accountDigest: "d".repeat(64) })).toBeNull();
  const entries = Reflect.get(cache, "entries") as Map<string, { json: string }>;
  expect([...entries.keys()]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  expect([...entries.keys()]).not.toContain(scope.credentialRevision);
});
