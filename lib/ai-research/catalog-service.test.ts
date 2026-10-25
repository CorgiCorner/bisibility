import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  credentials: vi.fn(),
  fetch: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./catalog", () => ({ fetchAiResearchCapabilities: mocks.fetch }));
vi.mock("@/lib/providers/connection-credentials", () => ({
  resolveConnectionCredentials: mocks.credentials,
}));
vi.mock("@/lib/provider-lookups/cache", () => ({ withProviderLookupCache: mocks.cache }));
vi.mock("@/lib/provider-lookups/paid-call", async () => ({
  ProviderLookupSignal: (await import("@/lib/provider-lookups/lookup-failure"))
    .ProviderLookupSignal,
}));

import { AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS } from "./catalog-freshness";
import { getAiResearchCatalog, loadAiResearchCapabilities } from "./catalog-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({
    connection: {
      id: "connection",
      credentialSource: "own",
      credentialsEncrypted: "fixture-marker",
    },
  });
  mocks.credentials.mockResolvedValue({ login: "fixture", password: "fictional" });
  mocks.cache.mockImplementation(async ({ load }) => ({ status: "success", value: await load() }));
  mocks.fetch.mockResolvedValue({ catalog: { fetchedAt: new Date().toISOString(), models: [] } });
});

describe("AI catalog source failures", () => {
  it.each([
    null,
    {},
    { login: "fixture" },
    { password: "fixture" },
    { localReview: true, sourceSha: "fictional" },
  ])(
    "classifies missing usable credentials as no source before metadata: %j",
    async (credentials) => {
      mocks.credentials.mockResolvedValue(credentials);
      expect(await getAiResearchCatalog("project")).toMatchObject({
        ok: false,
        reason: "no_source",
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it("does not let a cached catalog conceal absent usable credentials", async () => {
    mocks.credentials.mockResolvedValue({});
    mocks.cache.mockResolvedValue({
      status: "success",
      cached: true,
      value: { fetchedAt: new Date().toISOString(), models: [] },
    });
    expect(await getAiResearchCatalog("project")).toMatchObject({ ok: false, reason: "no_source" });
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves missing connection as no source", async () => {
    mocks.source.mockRejectedValue(new ProviderLookupSignal({ ok: false, reason: "no_source" }));
    expect(await getAiResearchCatalog("project")).toMatchObject({ ok: false, reason: "no_source" });
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves the bounded fresh-catalog read for valid credentials", async () => {
    expect(await getAiResearchCatalog("project")).toMatchObject({
      ok: true,
      catalog: { actualCostAvailable: true },
    });
    expect(mocks.credentials).toHaveBeenCalledWith(expect.any(Object), "free_catalog");
    expect(mocks.fetch).toHaveBeenCalledWith(
      { login: "fixture", password: "fictional" },
      expect.any(Number),
    );
    expect(mocks.cache).toHaveBeenCalledWith(
      expect.objectContaining({
        fresh: false,
        ttlSeconds: AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS,
      }),
    );
  });
  it("does not reuse free pool credentials for paid admission pricing", async () => {
    const source = await mocks.source();
    mocks.credentials.mockImplementation(async (_connection, purpose) => {
      if (purpose !== "free_catalog")
        throw new Error("Pooled credentials require an admitted execution.");
      return { login: "catalog-only", password: "fictional" };
    });
    await expect(loadAiResearchCapabilities(source)).rejects.toThrow(
      "Pooled credentials require an admitted execution.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await getAiResearchCatalog("project")).toMatchObject({ ok: true });
  });
  it("keeps transport failures distinct without disclosing their private error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetch.mockRejectedValue(new Error("upstream timed out"));
    const outcome = await getAiResearchCatalog("project");
    expect(outcome).toMatchObject({ ok: false, reason: "provider_unavailable" });
    expect(JSON.stringify(outcome)).not.toContain("upstream timed out");
    expect(log).toHaveBeenCalledWith(
      "[ai-research] free catalog load failed",
      expect.objectContaining({ projectId: "project", name: "Error", error: "upstream timed out" }),
    );
    log.mockRestore();
  });
  it("reads once more when a parallel render still holds the catalog lock", async () => {
    mocks.cache
      .mockResolvedValueOnce({ status: "contended", resetAt: Date.now() + 1_000 })
      .mockImplementationOnce(async ({ load }) => ({ status: "success", value: await load() }));
    expect(await getAiResearchCatalog("project")).toMatchObject({ ok: true });
    expect(mocks.cache).toHaveBeenCalledTimes(2);
  });
  it("reports contention after the second read and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.cache.mockResolvedValue({ status: "contended", resetAt: Date.now() + 1_000 });
    expect(await getAiResearchCatalog("project")).toMatchObject({ ok: false, reason: "contended" });
    expect(mocks.cache).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("[ai-research] catalog load still contended after retry", {
      projectId: "project",
    });
    log.mockRestore();
  });
});
