import { PROVIDER_FEATURE_RATES } from "@/lib/cost-estimate/provider-feature-rates";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createDataForSeoBacklinksMethods } from "@/lib/providers/serp/dataforseo-backlinks";
import { createDataForSeoDomainMethods } from "@/lib/providers/serp/dataforseo-domain";
import { createDataForSeoResearchMethods } from "@/lib/providers/serp/dataforseo-research";
import { beforeEach, expect, test, vi } from "vitest";
import { nativeProviderCatalog } from "./catalog-source";
import { loadNativeFeatureCostCents, nativeFeatureOptions } from "./native-feature-quote";
import { ProviderQuoteUnavailableError } from "./native-quote";

const measured = vi.hoisted(() => vi.fn());
vi.mock("./native-price-query", () => ({ loadNativeMeasuredPrice: measured }));
const connection = { id: "connection", provider: "dataforseo", credentialsEncrypted: "encrypted" };
function database(amount?: string) {
  return {
    providerConnection: {
      findUnique: vi.fn().mockResolvedValue({
        ...connection,
        credentialSource: "own",
        projectId: "project",
        project: { ownerId: "owner" },
        enabled: true,
        status: "connected",
        rates: amount === undefined ? [] : [{ amountCents: amount }],
      }),
    },
    $queryRaw: vi.fn(),
  } as unknown as Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
}
function rate(feature: string) {
  const result = PROVIDER_FEATURE_RATES.find((row) => row.feature === feature);
  if (!result) throw new Error("Missing test rate");
  return result;
}
beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  measured.mockReset();
});

test.each(["0", "1.55"])("manual ranked-keyword %s is a whole-call quote", async (amount) => {
  for (const itemCount of [1, 100, 1000]) {
    expect(
      await loadNativeFeatureCostCents(database(amount), {
        connection,
        feature: "ranked_keywords",
        itemCount,
        rate: rate("ranked_keywords"),
      }),
    ).toBe(Number(amount));
  }
  expect(measured).not.toHaveBeenCalled();
});

test.each([
  ["keyword_research_related", "fetchRelatedKeywords"],
  ["keyword_research_suggestions", "fetchKeywordSuggestions"],
  ["keyword_research_ideas", "fetchKeywordIdeas"],
  ["keyword_metrics", "fetchKeywordMetrics"],
] as const)("%s quote has the options of the actual feature transport", async (feature, method) => {
  const request = vi.fn().mockResolvedValue({
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ items: [] }] }],
  });
  const methods = createDataForSeoResearchMethods({
    request,
    locationParams: () => ({ location_code: 2840, language_code: "en" }),
  });
  const itemCount = 5;
  const location = {
    gl: "us",
    hl: "en",
    primaryGeoCode: 2840,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  };
  for (const includeClickstream of [false, true]) {
    const input = {
      includeClickstream,
      location,
      seed: "seed",
      limit: itemCount,
      keywords: Array.from({ length: itemCount }, (_, i) => `keyword${i}`),
    };
    await methods[method]({ login: "fixture", password: "fixture" }, input);
    const [url, , payload] = request.mock.calls.at(-1) ?? [];
    const matched = nativeProviderCatalog.match("dataforseo", {
      method: "POST",
      url,
      body: [payload],
    });
    if (matched.operation === "unknown") throw new Error("Unmatched real request");
    await loadNativeFeatureCostCents(database(), {
      connection,
      feature: feature === "keyword_metrics" ? feature : "keyword_research",
      itemCount,
      includeClickstream,
      rate: rate(feature),
    });
    expect(measured.mock.calls.at(-1)?.slice(2, 4)).toEqual([
      matched.operation.id,
      matched.options,
    ]);
  }
});

test("credential rotation prevents quoting even with a manual rate", async () => {
  await expect(
    loadNativeFeatureCostCents(database("0"), {
      connection: { ...connection, credentialsEncrypted: "stale" },
      feature: "ranked_keywords",
      itemCount: 1,
      rate: rate("ranked_keywords"),
    }),
  ).rejects.toThrow("credential binding changed");
  expect(measured).not.toHaveBeenCalled();
});

test.each([
  { enabled: false, status: "connected" },
  { enabled: true, status: "error" },
])("unavailable connections refuse feature quotes without a fallback: %j", async (availability) => {
  const db = database();
  vi.mocked(db.providerConnection.findUnique).mockResolvedValue({
    ...connection,
    credentialSource: "own",
    projectId: "project",
    project: { ownerId: "owner" },
    rates: [],
    ...availability,
  } as never);
  await expect(
    loadNativeFeatureCostCents(db, {
      connection,
      feature: "ranked_keywords",
      itemCount: 1,
      rate: rate("ranked_keywords"),
    }),
  ).rejects.toBeInstanceOf(ProviderQuoteUnavailableError);
  expect(measured).not.toHaveBeenCalled();
});

test("history without a provable count stays unknown", async () => {
  await expect(
    loadNativeFeatureCostCents(database(), {
      connection,
      feature: "domain_overview",
      itemCount: 1,
      rate: rate("historical_rank_overview"),
    }),
  ).rejects.toThrow("no confirmed monetary estimate");
});

test.each([
  ["backlinks_history", 12, "2025-10-01", "2026-09-30", 2.4432],
  ["historical_rank_overview", 6, "2026-04-01", "2026-09-30", 12.72],
] as const)(
  "%s quote matches the actual bounded history transport",
  async (feature, itemCount, dateFrom, dateTo, expectedCost) => {
    const request = vi.fn().mockResolvedValue({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [] }],
    });
    const historyWindow = { dateFrom, dateTo };
    if (feature === "backlinks_history") {
      await createDataForSeoBacklinksMethods({ request }).fetchBacklinksHistory(
        { login: "fixture", password: "fixture" },
        { includeSubdomains: true, target: "example.com", targetScope: "site", historyWindow },
      );
    } else {
      const location = {
        gl: "pl",
        hl: "pl",
        primaryGeoCode: 2616,
        primaryGeoName: "",
        secondaryGeoName: "",
      };
      await createDataForSeoDomainMethods({
        request,
        requestStatus: vi.fn(),
        locationParams: () => ({ location_code: 2616, language_code: "pl" }),
      }).fetchHistoricalRankOverview(
        { login: "fixture", password: "fixture" },
        { includeSubdomains: true, location, target: "example.com", dateFrom, dateTo },
      );
    }
    const [url, , payload] = request.mock.calls[0];
    const matched = nativeProviderCatalog.match("dataforseo", {
      method: "POST",
      url,
      body: [payload],
    });
    if (matched.operation === "unknown") throw new Error("Unmatched real history request");
    expect(nativeFeatureOptions(rate(feature), itemCount, undefined, historyWindow)).toEqual(
      matched.options,
    );
    expect(
      await loadNativeFeatureCostCents(database(), {
        connection,
        feature: feature === "backlinks_history" ? "backlinks" : "domain_overview",
        itemCount,
        historyWindow,
        rate: rate(feature),
      }),
    ).toBeCloseTo(expectedCost, 6);
    expect(measured.mock.calls.at(-1)?.slice(2, 4)).toEqual([
      matched.operation.id,
      matched.options,
    ]);
    expect(matched.options).toMatchObject({ itemCount: String(itemCount), dateFrom, dateTo });
  },
);

test.each([
  { dateFrom: "2026-09-01", dateTo: "2026-04-30" },
  { dateFrom: "2026-02-30", dateTo: "2026-09-30" },
  { dateFrom: "2026-04-01", dateTo: "" },
])("invalid history bounds cannot acquire a price through itemCount: %j", async (historyWindow) => {
  await expect(
    loadNativeFeatureCostCents(database(), {
      connection,
      feature: "domain_overview",
      itemCount: 6,
      historyWindow,
      rate: rate("historical_rank_overview"),
    }),
  ).rejects.toBeInstanceOf(ProviderQuoteUnavailableError);
});
