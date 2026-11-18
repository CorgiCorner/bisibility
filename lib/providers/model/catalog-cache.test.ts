import { catalog, digest, entry } from "@/lib/model-playground/contract-fixtures.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_CATALOG_CACHE_LIMITS,
  ModelCatalogCache,
  type ModelCatalogScope,
} from "./catalog-cache";

const scope = (): ModelCatalogScope => ({
  providerId: "openrouter",
  accountDigest: digest,
  credentialRevision: "b".repeat(64),
});
const snapshot = () =>
  catalog({
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("bounded normalized model catalog cache", () => {
  it("isolates provider, account and credential revision", () => {
    const cache = new ModelCatalogCache();
    cache.set(scope(), snapshot());
    expect(cache.get(scope())).toEqual(snapshot());
    expect(cache.get({ ...scope(), accountDigest: "c".repeat(64) })).toBeNull();
    expect(cache.get({ ...scope(), credentialRevision: "d".repeat(64) })).toBeNull();
    expect(cache.get({ ...scope(), providerId: "openai" })).toBeNull();
  });

  it("cannot mutate cached evidence through caller references", () => {
    const cache = new ModelCatalogCache();
    const source = snapshot();
    cache.set(scope(), source);
    source.models[0].modelId = "mutated-source";
    const read = cache.get(scope());
    if (!read) throw new Error("Missing fixture");
    read.models[0].modelId = "mutated-read";
    expect(cache.get(scope())?.models[0].modelId).toBe(entry().modelId);
  });

  it("expires at the smaller snapshot expiry or server TTL, never serves stale metadata", () => {
    const cache = new ModelCatalogCache();
    cache.set(scope(), snapshot());
    vi.advanceTimersByTime(MODEL_CATALOG_CACHE_LIMITS.ttlMs);
    expect(cache.get(scope())).toBeNull();
    cache.set(scope(), { ...snapshot(), expiresAt: new Date(Date.now() + 10).toISOString() });
    vi.advanceTimersByTime(10);
    expect(cache.get(scope())).toBeNull();
  });

  it("bounds entry count and evicts the least recently read scope", () => {
    const cache = new ModelCatalogCache();
    const scopes = Array.from({ length: MODEL_CATALOG_CACHE_LIMITS.entries + 1 }, (_, index) => ({
      ...scope(),
      credentialRevision: index.toString(16).padStart(64, "0"),
    }));
    for (const s of scopes.slice(0, -1)) cache.set(s, snapshot());
    cache.get(scopes[0]);
    cache.set(scopes.at(-1) as ModelCatalogScope, snapshot());
    expect(cache.get(scopes[0])).not.toBeNull();
    expect(cache.get(scopes[1])).toBeNull();
  });

  it("bounds total retained bytes independently of entry count", () => {
    const cache = new ModelCatalogCache();
    const large = snapshot();
    large.models = Array.from({ length: 450 }, (_, index) =>
      entry({
        modelId: `vendor/model-${index}`,
        text: { ...entry().text, documentationUrl: `https://example.com/${"a".repeat(400)}` },
      }),
    );
    expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(
      MODEL_CATALOG_CACHE_LIMITS.entryBytes,
    );
    for (let index = 0; index < 15; index++)
      cache.set({ ...scope(), credentialRevision: index.toString(16).padStart(64, "0") }, large);
    expect(cache.get({ ...scope(), credentialRevision: "0".repeat(64) })).toBeNull();
    expect(
      cache.get({ ...scope(), credentialRevision: (14).toString(16).padStart(64, "0") }),
    ).not.toBeNull();
  });

  it("rejects future, expired, mismatched or oversized snapshots", () => {
    const cache = new ModelCatalogCache();
    for (const value of [
      { ...snapshot(), accountDigest: "c".repeat(64) },
      { ...snapshot(), providerId: "openai" },
      { ...snapshot(), fetchedAt: new Date(Date.now() + 1).toISOString() },
      { ...snapshot(), expiresAt: new Date().toISOString() },
      {
        ...snapshot(),
        models: [
          entry({
            text: {
              ...entry().text,
              documentationUrl: `https://example.org/${"x".repeat(600000)}`,
            },
          }),
        ],
      },
    ])
      expect(() => cache.set(scope(), value as never)).toThrow("invalid response");
    expect(cache.get(scope())).toBeNull();
  });

  it("rejects raw secrets, prompts and upstream payload fields rather than caching them", () => {
    const cache = new ModelCatalogCache();
    for (const field of ["apiKey", "prompt", "headers", "rawResponse"]) {
      expect(() => cache.set(scope(), { ...snapshot(), [field]: "SYNTHETIC-CANARY" })).toThrow(
        "invalid response",
      );
      expect(() => cache.get({ ...scope(), [field]: "SYNTHETIC-CANARY" })).toThrow("not allowed");
    }
    expect(cache.get(scope())).toBeNull();
  });
});
