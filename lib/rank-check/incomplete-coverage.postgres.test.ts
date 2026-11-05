import { evaluateKeywordAlerts } from "@/lib/alerts/evaluate";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { indeterminateRankFailure } from "@/lib/temporal/rank-check-indeterminate";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { isRankCheckFailureCode, providerFailurePresentation } from "./failure-presentation";
import { fallbackAttempt } from "./fallback-attempt";
import { runCheck } from "./runner";
import { persistFailedRankCheckInTransaction } from "./runner-persistence";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock("./runner-definition", () => ({
  prepareRunnerDefinition: async (input: unknown) => ({ input, definition: null }),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
  writeCooldown: vi.fn(),
}));

let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let locationId: string;
const location = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};
beforeAll(async () => {
  fixture = await closeoutPostgresFixture();
  state.db = fixture.db;
  const row = await fixture.db.location.create({
    data: {
      ...location,
      canonicalKey: "coverage-fixture",
      countryCode: "US",
      displayName: "United States",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
    },
  });
  locationId = row.id;
}, 120_000);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await fixture?.close();
});

function page(start: number, overlap = false) {
  return {
    organic_results: Array.from({ length: 10 }, (_, index) => ({
      link: `https://other.example.org/${overlap && index === 0 ? 9 : start + index}`,
      position: index + 1,
    })),
    search_metadata: { id: `search-${start}`, status: "Success" },
    search_parameters: { start },
    serpapi_pagination: { next: `https://serpapi.com/search.json?start=${start + 10}` },
  };
}
async function keyword(text: string) {
  return fixture.db.keyword.create({
    data: {
      text,
      location: "United States",
      locationId,
      projectId: "normal",
      publicId: makePublicId("kw"),
    },
  });
}
function execute(keywordId: string) {
  return runCheck({
    connection: {
      provider: "serpapi",
      credentials: { apiKey: "fixture", usageObserver: testUsageObserver },
    },
    keyword: {
      id: keywordId,
      text: "coverage fixture",
      device: "desktop",
      domain: "example.com",
      location,
    },
    depth: 20,
    stopOnMatch: false,
    provider: serpApiProvider,
    comparisonAllowed: true,
    previousPosition: 1,
    schedule: { frequency: "manual" },
  });
}

it.each(["repeat", "overlap", "short", "gap-local", "gap-absolute"])(
  "persists %s coverage as failed without a completed miss or drop alert",
  async (mode) => {
    const target = await keyword(`coverage-${mode}`);
    const previous = await fixture.db.rankCheck.create({
      data: {
        checkedAt: new Date("2026-01-01"),
        keywordId: target.id,
        publicId: makePublicId("check"),
        position: 1,
        provider: "serpapi",
        status: "completed",
        requestedDepth: 20,
      },
    });
    const running = await fixture.db.rankCheck.create({
      data: {
        checkedAt: new Date("2026-01-02"),
        keywordId: target.id,
        publicId: makePublicId("check"),
        provider: "serpapi",
        status: "running",
      },
    });
    await fixture.db.alertRule.create({
      data: {
        projectId: "normal",
        publicId: makePublicId("alr"),
        name: "Top ten exit",
        conditionType: "exits_top_n",
        severity: "warning",
        channels: [],
        topN: 10,
      },
    });
    await fixture.db.alertRule.create({
      data: {
        projectId: "normal",
        publicId: makePublicId("alr"),
        name: "Position drop",
        conditionType: "position_drop",
        severity: "warning",
        channels: [],
        dropPositions: 1,
      },
    });
    const first = page(0);
    const second = mode === "repeat" ? first : page(10, mode === "overlap");
    if (mode === "short") first.organic_results.pop();
    if (mode.startsWith("gap-")) first.organic_results[9].position = 11;
    if (mode === "gap-absolute") for (const row of second.organic_results) row.position += 10;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify(second)));
    vi.stubGlobal("fetch", fetchMock);
    const error: unknown = await execute(target.id).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: "provider_failed",
      cause: { code: "organic_depth_not_covered" },
    });
    expect(fallbackAttempt(error, "serpapi")).toBeNull();
    const failure = await indeterminateRankFailure(error, running.id);
    expect(failure).toMatchObject({ type: "organic_depth_not_covered", nonRetryable: true });
    const stored = await fixture.db.rankCheck.findUniqueOrThrow({ where: { id: running.id } });
    expect(isRankCheckFailureCode(stored.errorCode)).toBe(true);
    if (!isRankCheckFailureCode(stored.errorCode)) throw new Error("Missing stable failure code");
    const errorCode = stored.errorCode;
    if (!failure) throw new Error("Missing Temporal failure");
    const persisted = await fixture.db.$transaction((tx) =>
      persistFailedRankCheckInTransaction(tx, {
        error: failure.message,
        errorCode,
        existingRankCheckId: running.id,
        keywordId: target.id,
        keywordPublicId: target.publicId,
        projectId: "normal",
        provider: "serpapi",
        previousPosition: previous.position,
        requestedDepth: 20,
      }),
    );
    expect(persisted).toMatchObject({
      status: "failed",
      errorCode: "organic_depth_not_covered",
      position: null,
      comparisonAllowed: false,
    });
    expect(providerFailurePresentation(persisted.errorCode, persisted.error)).toMatchObject({
      code: "organic_depth_not_covered",
      showRetry: false,
    });
    expect(
      await fixture.db.rankCheck.count({ where: { keywordId: target.id, status: "completed" } }),
    ).toBe(1);
    expect(
      await fixture.db.alertEvaluationIntent.count({ where: { rankCheckId: running.id } }),
    ).toBe(0);
    expect(await fixture.db.triggeredAlert.count({ where: { keywordId: target.id } })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

it("preserves a later positive rank on distinct short pages", async () => {
  const target = await keyword("coverage-positive");
  const first = page(0);
  first.organic_results.pop();
  const second = page(10);
  second.organic_results[2].link = "https://example.com/target";
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(first)))
    .mockResolvedValueOnce(new Response(JSON.stringify(second)));
  vi.stubGlobal("fetch", fetchMock);
  const result = await execute(target.id);
  expect(result.rankCheck).toMatchObject({
    position: 12,
    rankingUrl: "https://example.com/target",
  });
  expect(result.comparisonAllowed).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("fires the exit rule for a comparable completed miss", async () => {
  const target = await keyword("coverage-valid-miss");
  const rule = await fixture.db.alertRule.create({
    data: {
      projectId: "normal",
      publicId: makePublicId("alr"),
      name: "Control exit",
      conditionType: "exits_top_n",
      severity: "warning",
      targetType: "keyword",
      channels: [],
      topN: 10,
      targets: { create: { keywordId: target.id } },
    },
  });
  const check = await fixture.db.rankCheck.create({
    data: {
      keywordId: target.id,
      publicId: makePublicId("check"),
      position: null,
      previousPosition: 1,
      comparisonAllowed: true,
      provider: "serpapi",
      requestedDepth: 20,
      status: "completed",
    },
  });
  const alerts = await evaluateKeywordAlerts(
    target.id,
    { position: 1 },
    { position: null, requestedDepth: 20, rankCheckId: check.id },
    { comparisonAllowed: true, deliveryMode: "deferred" },
  );
  expect(alerts.some((alert) => alert.ruleId === rule.id)).toBe(true);
  expect(
    await fixture.db.triggeredAlert.count({ where: { rankCheckId: check.id, ruleId: rule.id } }),
  ).toBe(1);
});
