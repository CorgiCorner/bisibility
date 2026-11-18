import { providerAreaCapabilities } from "@/lib/api/provider-list";
import { providerAdapter } from "@/lib/api/provider-verification";
import {
  accountHealthAdapter,
  accountHealthProviders,
} from "@/lib/providers/account-health/registry";
import {
  getAnalyticsProvider,
  getSerpProvider,
  PROVIDER_CATALOG,
  serpProviderCapabilities,
} from "@/lib/providers/registry";
import { primaryProviderConnection } from "@/lib/rank-check/provider-chain-order";
import { firstSyncIntentOnConnect } from "@/lib/traffic/first-sync-intent-state";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NATIVE_MODEL_PROVIDERS } from "./types";

beforeEach(() => {
  vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(NATIVE_MODEL_PROVIDERS)(
  "rejects %s for rank-check, SERP fallback and first analytics sync",
  (provider) => {
    const model = {
      provider,
      kind: "model" as const,
      enabled: true,
      priority: 0,
      status: "connected",
    };
    const item = PROVIDER_CATALOG.find((entry) => entry.id === provider);
    if (!item) throw new Error("Missing model fixture");
    expect(() => providerAdapter(item)).toThrow(
      "Provider does not expose a connection test adapter yet.",
    );
    expect(accountHealthProviders()).not.toContain(provider);
    expect(accountHealthAdapter(provider)).toBeUndefined();
    expect(() => getSerpProvider(provider)).toThrow("Unknown SERP provider");
    expect(() => getAnalyticsProvider(provider)).toThrow("Unknown analytics provider");
    expect(serpProviderCapabilities(provider)).toBeNull();
    expect(providerAreaCapabilities("model", provider)).toEqual({
      backlinks: false,
      domainOverview: false,
      keywordMetrics: false,
      keywordResearch: false,
      rankChecks: false,
      searchPerformance: false,
    });
    const serp = { ...model, provider: "serpapi", kind: "serp" as const, priority: 1 };
    expect(primaryProviderConnection([model, serp], "serp")).toBe(serp);
    expect(firstSyncIntentOnConnect(null, model, new Date(), true)).toEqual({});
  },
);
