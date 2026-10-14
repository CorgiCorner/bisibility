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

import { getAiResearchCatalog } from "./catalog-service";

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
    expect(mocks.fetch).toHaveBeenCalledWith(
      { login: "fixture", password: "fictional" },
      expect.any(Number),
    );
    expect(mocks.cache).toHaveBeenCalledWith(
      expect.objectContaining({ fresh: false, ttlSeconds: 300 }),
    );
  });
  it("keeps transport failures distinct without disclosing their private error", async () => {
    mocks.fetch.mockRejectedValue(new Error("fictional-private-credential-detail"));
    const outcome = await getAiResearchCatalog("project");
    expect(outcome).toMatchObject({ ok: false, reason: "provider_unavailable" });
    expect(JSON.stringify(outcome)).not.toContain("fictional-private-credential-detail");
  });
});
