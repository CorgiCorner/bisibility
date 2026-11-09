import { WeeklyRequestCapError } from "@/lib/operations/weekly-request-error";
import { testOwnAdmission } from "@/lib/provider-usage/byok-test-evidence";
import { byokTestJournal } from "@/lib/provider-usage/byok-test-journal";
import type { SerpProvider } from "@/lib/providers/types";
import { readObservedResponse } from "@/lib/providers/usage";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/provider-usage/admission-extension", async () => {
  const { testOwnAdmission } = await import("@/lib/provider-usage/byok-test-evidence");
  return { ownAdmission: testOwnAdmission };
});
vi.mock("./runner-definition", () => ({
  prepareRunnerDefinition: async (input: unknown) => ({ input, definition: null }),
}));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: vi.fn(),
  assertOperationAccessInTransaction: vi.fn(),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
  writeCooldown: vi.fn(),
}));

import { fallbackAttempt } from "./fallback-attempt";
import { runCheck } from "./runner";
import { RankCheckRunnerError } from "./runner-error";

let ledger: ReturnType<typeof byokTestJournal>;
beforeEach(() => {
  ledger = byokTestJournal("dataforseo");
  Object.assign(mocks.db, ledger.db);
});
it.each([
  [0.3, false],
  [0, false],
  [0.3, true],
  [0, true],
] as const)(
  "preserves measured BYOK failure cost %s and forbids another purchase only when charged",
  async (costCents, earlierPage) => {
    const provider: SerpProvider = {
      id: "dataforseo",
      label: "Fixture",
      testConnection: vi.fn(),
      fetchRank: async ({ credentials }) => {
        if (earlierPage)
          await readObservedResponse({
            observer: credentials?.usageObserver,
            request: async () => new Response("{}"),
            measure: () => ({ cached: false, failed: false, costCents: 1.2, quantity: 1 }),
          });
        await readObservedResponse({
          observer: credentials?.usageObserver,
          request: async () => new Response(JSON.stringify({ status: "error" })),
          measure: () => ({ cached: false, failed: true, costCents, quantity: 1 }),
        });
        throw new Error("Measured response is unusable");
      },
    };
    const error = await failedCheck(provider).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(RankCheckRunnerError);
    expect(error).toMatchObject({ code: "provider_failed", chargedCents: costCents });
    expect(ledger.rows).toHaveLength(earlierPage ? 2 : 1);
    expect(ledger.rows.at(-1)).toMatchObject({
      costCents,
      failed: true,
      measurementStatus: "recorded",
    });
    if (costCents > 0) expect(fallbackAttempt(error, "dataforseo")).toBeNull();
    else expect(fallbackAttempt(error, "dataforseo")).not.toBeNull();
  },
);

function failedCheck(provider: SerpProvider) {
  return runCheck({
    connection: {
      id: "connection_1",
      provider: "dataforseo",
      credentials: { login: "fixture", password: "fixture" },
    },
    keyword: {
      id: "keyword_1",
      text: "fixture",
      domain: "example.com",
      device: "desktop",
      location: {
        gl: "us",
        hl: "en",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    },
    projectId: "project_1",
    provider,
    schedule: { frequency: "manual" },
    providerUsage: {
      context: {
        correlationId: "failure",
        projectId: "project_1",
        feature: "rank_check",
        source: "app",
        trigger: "manual",
      },
      tag: "fixture",
    },
  });
}

it("blocks fallback when a BYOK request started without a confirmed receipt", async () => {
  const error = await failedCheck({
    id: "dataforseo",
    label: "Fixture",
    testConnection: vi.fn(),
    fetchRank: async ({ credentials }) => {
      await credentials?.usageObserver?.begin();
      throw new Error("Unconfirmed paid request");
    },
  }).catch((cause: unknown) => cause);
  expect(error).toMatchObject({ name: "ProviderUsagePersistenceError" });
  expect(fallbackAttempt(error, "dataforseo")).toBeNull();
  expect(ledger.rows).toHaveLength(1);
  expect(ledger.rows[0]).toMatchObject({ measurementStatus: "unknown" });
});

it.each(["reservation", "fence", "later-page"])(
  "keeps weekly %s denial actionable through the runner",
  async (phase) => {
    const denial = new WeeklyRequestCapError("2026-11-12T00:00:00Z");
    const request = vi.fn(async () => new Response("{}"));
    const provider: SerpProvider = {
      id: "dataforseo",
      label: "Fixture",
      testConnection: vi.fn(),
      fetchRank: async ({ credentials }) => {
        const attempt = () =>
          readObservedResponse({
            observer: credentials?.usageObserver,
            request,
            measure: () => ({ cached: false, failed: false, costCents: 1.2, quantity: 1 }),
          });
        if (phase === "later-page") await attempt();
        testOwnAdmission[phase === "reservation" ? "reserve" : "fence"].mockRejectedValueOnce(
          denial,
        );
        await attempt();
        throw new Error("unreachable");
      },
    };
    const error = await failedCheck(provider).catch((cause: unknown) => cause);
    expect(error).toBe(denial);
    expect(fallbackAttempt(error, "dataforseo")).toBeNull();
    expect(request).toHaveBeenCalledTimes(phase === "later-page" ? 1 : 0);
    expect(ledger.rows.filter((row) => !row.discarded)).toHaveLength(
      phase === "later-page" ? 1 : 0,
    );
  },
);
