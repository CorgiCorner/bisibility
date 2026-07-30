import { ProviderAuthError } from "@/lib/providers/auth-error";
import { encryptSecret } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importTopQueries } from "./keyword-suggest";

const mocks = vi.hoisted(() => {
  const provider = {
    fetchTopQueries: vi.fn(),
    id: "query-source",
    label: "Query source",
    testConnection: vi.fn(),
  };
  const providerWithoutCapability = {
    id: "page-source",
    label: "Page source",
    testConnection: vi.fn(),
  };
  const providers = {
    "page-source": providerWithoutCapability,
    "query-source": provider,
  };

  return {
    actor: { id: "user_1" },
    consumeProviderLimit: vi.fn(),
    getActionActor: vi.fn(),
    getAnalyticsProvider: vi.fn((id: keyof typeof providers) => providers[id]),
    markProviderNeedsReauth: vi.fn(),
    prisma: {
      providerConnection: { findMany: vi.fn() },
    },
    project: { id: "project_1", ownerId: "user_1", publicId: "prj_1" },
    provider,
    providerWithoutCapability,
    requireProjectScope: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/auth-state", () => ({
  markProviderNeedsReauth: mocks.markProviderNeedsReauth,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
}));
vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: mocks.getAnalyticsProvider,
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
}));

function analyticsSource(provider = "query-source") {
  return {
    credentialsEncrypted: encryptSecret(
      JSON.stringify({ apiKey: "access_token", login: "property-id" }),
    ),
    id: `connection_${provider}`,
    provider,
  };
}

describe("keyword suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.requireProjectScope.mockResolvedValue(mocks.project);
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "gsc:account",
      cooling: false,
      remaining: 10,
      resetAt: Date.now() + 60_000,
      success: true,
    });
    mocks.markProviderNeedsReauth.mockResolvedValue(true);
  });

  it("authorizes project read scope before loading top queries", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);

    await importTopQueries({ projectId: "prj_1" });

    expect(mocks.getActionActor).toHaveBeenCalled();
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(mocks.actor, "read", "prj_1", {
      type: "project",
    });
  });

  it("returns a typed no-source reason without consuming provider quota", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);

    await expect(importTopQueries({ projectId: "prj_1" })).resolves.toEqual({
      queries: [],
      reason: "no_source",
    });
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.provider.fetchTopQueries).not.toHaveBeenCalled();
  });

  it("consumes provider quota and returns unique trimmed queries", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([analyticsSource()]);
    mocks.provider.fetchTopQueries.mockResolvedValue([
      { clicks: 12, impressions: 100, query: " Rank Tracker " },
      { clicks: 9, impressions: 90, query: "rank tracker" },
      { clicks: 8, impressions: 80, query: "SEO API" },
      { clicks: 7, impressions: 70, query: " " },
      { clicks: 6, impressions: 60, query: "local seo" },
    ]);

    await expect(importTopQueries({ limit: 2, projectId: "prj_1" })).resolves.toEqual({
      hidden: [],
      hiddenCount: 0,
      queries: ["Rank Tracker", "SEO API"],
      suggestions: [
        { clicks: 12, impressions: 100, query: "Rank Tracker" },
        { clicks: 8, impressions: 80, query: "SEO API" },
      ],
    });
    expect(mocks.consumeProviderLimit).toHaveBeenCalledWith(
      "query-source",
      { apiKey: "access_token", login: "property-id" },
      { projectId: "project_1" },
    );
    expect(mocks.provider.fetchTopQueries).toHaveBeenCalledWith(
      { apiKey: "access_token", login: "property-id" },
      { limit: 2 },
    );
  });

  it("skips providers without top-query capability and respects fallback order", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      analyticsSource("page-source"),
      analyticsSource("query-source"),
    ]);
    mocks.provider.fetchTopQueries.mockResolvedValue([{ query: "fallback keyword" }]);

    await expect(importTopQueries({ projectId: "prj_1" })).resolves.toEqual({
      hidden: [],
      hiddenCount: 0,
      queries: ["fallback keyword"],
      suggestions: [{ query: "fallback keyword" }],
    });
    expect(mocks.getAnalyticsProvider).toHaveBeenNthCalledWith(1, "page-source");
    expect(mocks.getAnalyticsProvider).toHaveBeenNthCalledWith(2, "query-source");
    expect(mocks.consumeProviderLimit).toHaveBeenCalledWith(
      "query-source",
      { apiKey: "access_token", login: "property-id" },
      { projectId: "project_1" },
    );
  });

  it("returns no source when connected providers lack top-query capability", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([analyticsSource("page-source")]);

    await expect(importTopQueries({ projectId: "prj_1" })).resolves.toEqual({
      queries: [],
      reason: "no_source",
    });
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.provider.fetchTopQueries).not.toHaveBeenCalled();
  });

  it("stops before the provider call when the limiter rejects the import", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([analyticsSource()]);
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "query-source:account",
      cooling: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      success: false,
    });

    await expect(importTopQueries({ projectId: "prj_1" })).rejects.toThrow(
      "Rate limited, try again shortly.",
    );
    expect(mocks.provider.fetchTopQueries).not.toHaveBeenCalled();
  });

  it("marks dead Google authorization and returns a reconnect result", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([analyticsSource()]);
    mocks.provider.fetchTopQueries.mockRejectedValue(new ProviderAuthError("gsc"));

    await expect(importTopQueries({ projectId: "prj_1" })).resolves.toEqual({
      queries: [],
      reason: "needs_reauth",
    });
    expect(mocks.markProviderNeedsReauth).toHaveBeenCalledWith({
      connectionId: "connection_query-source",
      projectId: "project_1",
      provider: "query-source",
    });
  });

  it("does not change connection state for non-auth provider errors", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([analyticsSource()]);
    mocks.provider.fetchTopQueries.mockRejectedValue(new Error("provider unavailable"));

    await expect(importTopQueries({ projectId: "prj_1" })).rejects.toThrow("provider unavailable");
    expect(mocks.markProviderNeedsReauth).not.toHaveBeenCalled();
  });
});
