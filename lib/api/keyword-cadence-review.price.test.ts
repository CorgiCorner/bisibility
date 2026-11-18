import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { type ReviewCadence, rankUnitCents, reviewOccurrences } from "@/lib/schedules/review-cost";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { patchKeyword } from "./keywords";

const keywordId = "kw_b00000000000000000000000";
const mocks = vi.hoisted(() => ({
  createKeywordBatchSet: vi.fn(),
  defaultMarket: vi.fn(),
  findExisting: vi.fn(),
  findFirst: vi.fn(),
  findMembership: vi.fn(),
  resolveKeywordLocation: vi.fn(),
  setCadence: vi.fn(),
  transaction: vi.fn(),
  txFindMany: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({
  addTags: vi.fn(),
  createKeywordBatchSet: mocks.createKeywordBatchSet,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    keyword: {
      findFirst: mocks.findFirst,
      findMany: mocks.txFindMany,
      findUnique: mocks.findExisting,
    },
    projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
    providerConnection: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.setCadence,
}));
vi.mock("@/lib/serp/default-market", () => ({
  projectDefaultSerpMarket: mocks.defaultMarket,
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
  resolveKeywordLocationUsingStore: mocks.resolveKeywordLocation,
}));
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (keyword: { publicId: string }) => ({ id: keyword.publicId, type: "keyword" }),
  keywordResources: async (keywords: { publicId: string }[]) =>
    keywords.map((keyword) => ({ id: keyword.publicId, type: "keyword" })),
}));

const active = (frequency: string, extra: Record<string, unknown> = {}) => ({
  archivedAt: null,
  cronExpression: null,
  enabled: true,
  frequency,
  serpDepth: 20,
  ...extra,
});

function api(method: string, path: string, body: unknown) {
  const url = new URL(`https://example.com${path}`);
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "member" }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_a00000000000000000000000" } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: path.split("/").filter(Boolean),
    req: new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    }),
    url,
  } as never;
}

async function statusOf(response: Response) {
  const body = (await response.json()) as { code?: string };
  return {
    code: body.code ?? null,
    status: response.status,
    wrote: mocks.setCadence.mock.calls.length,
  };
}

describe("keyword cadence review prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultMarket.mockReturnValue({
      city: null,
      country: "United States",
      device: "desktop",
      locationKey: null,
    });
    mocks.resolveKeywordLocation.mockResolvedValue({
      location: {
        countryCode: "US",
        displayName: "United States",
        id: "location_1",
        languageCode: "en",
        languageLabel: "English",
      },
      warning: null,
    });
    mocks.findExisting.mockResolvedValue(null);
    mocks.findMembership.mockResolvedValue({ checkSchedule: active("weekly") });
    mocks.findFirst.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      location: "United States",
      locationId: "location_1",
      publicId: keywordId,
      text: "rank tracker",
    });
    mocks.txFindMany.mockResolvedValue([
      { archivedAt: null, id: "keyword_1", projectId: "project_1", publicId: keywordId },
    ]);
    mocks.setCadence.mockResolvedValue(new Map([["keyword_1", null]]));
    mocks.createKeywordBatchSet.mockResolvedValue({
      accepted: [{ created: true, keyword: { id: "keyword_1", publicId: keywordId }, row: {} }],
      created: [{ id: "keyword_1" }],
    });
    const stored = {
      device: "desktop",
      id: "keyword_1",
      publicId: keywordId,
      text: "rank tracker",
    };
    mocks.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(),
        keyword: {
          findMany: vi.fn(async () => [stored]),
          findUnique: mocks.findMembership,
          update: vi.fn(async () => stored),
        },
        keywordTag: { deleteMany: vi.fn() },
        projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
        providerConnection: { findFirst: vi.fn(async () => null) },
      }),
    );
  });

  it("prices a weekly depth-100 keyword moved to daily depth 10 from the provider rate", async () => {
    const now = new Date("2026-10-08T00:00:00.000Z");
    const projection = (frequency: ReviewCadence["frequency"], depth: 10 | 100) => {
      const runs = reviewOccurrences(
        {
          archived: false,
          cronExpression: null,
          enabled: true,
          frequency,
          jitterMinutes: 0,
          publicId: "keyword-review",
          serpDepth: depth,
          timeOfDay: null,
          timezone: "UTC",
        },
        now,
      );
      const unit = rankUnitCents(depth, "dataforseo");
      return {
        cents: runs === null || unit === null ? null : unit * runs,
        weight: runs === null ? null : runs * pagesPerCheck(depth),
      };
    };
    const before = projection("weekly", 100);
    const after = projection("daily", 10);
    expect(before.cents).not.toBeNull();
    expect(after.cents).not.toBeNull();
    expect(after.weight).toBeLessThan(before.weight as number);
    const increases = (after.cents as number) > (before.cents as number);
    expect(increases).toBe(false);
    mocks.findMembership.mockResolvedValue({
      checkSchedule: active("weekly", { providerPolicy: "dataforseo", serpDepth: 100 }),
    });
    const response = await patchKeyword(
      api("PATCH", `/api/v1/keywords/${keywordId}`, {
        schedule: { frequency: "daily", serp_depth: 10 },
      }),
      keywordId,
    );
    const observed = await statusOf(response);
    expect(observed.status).toBe(200);
  });

  it("rejects a month-restricted cron that the next month would miss", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));
    try {
      mocks.findMembership.mockResolvedValue({ checkSchedule: active("weekly") });
      const response = await patchKeyword(
        api("PATCH", `/api/v1/keywords/${keywordId}`, {
          schedule: { cron_expression: "0 9 * 2-6 *", frequency: "custom_cron" },
        }),
        keywordId,
      );
      expect((await statusOf(response)).status).toBe(428);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prices a default policy from the project's connected provider", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(),
        keyword: {
          findMany: vi.fn(async () => []),
          findUnique: mocks.findMembership,
          update: vi.fn(async () => ({})),
        },
        keywordTag: { deleteMany: vi.fn() },
        projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
        providerConnection: {
          findFirst: vi.fn(async () => ({ provider: "dataforseo" })),
        },
      }),
    );
    mocks.findMembership.mockResolvedValue({
      checkSchedule: active("weekly", { providerPolicy: null, serpDepth: 100 }),
    });
    const response = await patchKeyword(
      api("PATCH", `/api/v1/keywords/${keywordId}`, {
        schedule: { frequency: "daily", serp_depth: 10 },
      }),
      keywordId,
    );
    expect((await statusOf(response)).status).toBe(200);
  });

  it("prices an equal custom cron from the project's provider instead of the weight fallback", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(),
        keyword: {
          findMany: vi.fn(async () => []),
          findUnique: mocks.findMembership,
          update: vi.fn(async () => ({})),
        },
        keywordTag: { deleteMany: vi.fn() },
        projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 20 })) },
        providerConnection: {
          findFirst: vi.fn(async () => ({ provider: "dataforseo" })),
        },
      }),
    );
    mocks.findMembership.mockResolvedValue({
      checkSchedule: active("custom_cron", {
        cronExpression: "0 1 * * *",
        providerPolicy: null,
      }),
    });
    const response = await patchKeyword(
      api("PATCH", `/api/v1/keywords/${keywordId}`, {
        schedule: { cron_expression: "0 2 * * *", frequency: "custom_cron" },
      }),
      keywordId,
    );
    expect((await statusOf(response)).status).toBe(200);
  });
});
