import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkKeywords } from "./keyword-bulk";
import { createKeywords } from "./keyword-create";
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
  providerFindFirst: vi.fn(),
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
    providerConnection: { findFirst: mocks.providerFindFirst },
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

describe("keyword cadence review as of the 1.7 gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerFindFirst.mockResolvedValue(null);
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
        providerConnection: { findFirst: mocks.providerFindFirst },
      }),
    );
  });

  it.each([
    ["create daily", "create", { frequency: "daily", keyword: "rank tracker" }, 428],
    ["create weekly", "create", { frequency: "weekly", keyword: "rank tracker" }, 428],
    ["create monthly", "create", { frequency: "monthly", keyword: "rank tracker" }, 428],
    [
      "create custom cron",
      "create",
      {
        keyword: "rank tracker",
        schedule: { cron_expression: "0 1 * * *", frequency: "custom_cron" },
      },
      428,
    ],
    ["create manual", "create", { frequency: "manual", keyword: "rank tracker" }, 201],
  ] as const)("%s is %s", async (_name, _op, body, status) => {
    const response = await createKeywords(
      api("POST", "/api/v1/keywords", body),
      "prj_a00000000000000000000000",
    );
    expect(response.status).toBe(status);
    if (status === 428) {
      expect(await response.json()).toMatchObject({
        code: "schedule_review_required",
        detail: "This change may increase recurring spend. Review it in the web app for now.",
      });
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.createKeywordBatchSet).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["weekly to daily", active("weekly"), { frequency: "daily" }, 428],
    ["monthly to weekly", active("monthly"), { frequency: "weekly" }, 428],
    ["paused to daily", { ...active("daily"), enabled: false }, { frequency: "daily" }, 428],
    [
      "depth growth",
      active("daily", { serpDepth: 20 }),
      { schedule: { frequency: "daily", serp_depth: 50 } },
      428,
    ],
    [
      "cron hour change",
      active("custom_cron", { cronExpression: "0 1 * * *" }),
      { schedule: { frequency: "custom_cron", cron_expression: "0 2 * * *" } },
      428,
    ],
    [
      "custom cron decrease",
      active("custom_cron", { cronExpression: "0 * * * *" }),
      { schedule: { frequency: "custom_cron", cron_expression: "0 1 * * *" } },
      200,
    ],
    ["daily to weekly", active("daily"), { frequency: "weekly" }, 200],
    ["daily to manual", active("daily"), { frequency: "manual" }, 200],
    ["daily to paused", active("daily"), { frequency: "paused" }, 200],
    ["unchanged daily", active("daily"), { frequency: "daily" }, 200],
  ] as const)("update %s", async (_name, checkSchedule, patch, status) => {
    mocks.findMembership.mockResolvedValue({ checkSchedule });
    const response = await patchKeyword(
      api("PATCH", `/api/v1/keywords/${keywordId}`, patch),
      keywordId,
    );
    const observed = await statusOf(response);
    expect(observed.status).toBe(status);
    if (status === 428) {
      expect(observed.code).toBe("schedule_review_required");
      expect(observed.wrote).toBe(0);
    }
  });

  it.each([
    ["weekly to daily", active("weekly"), { frequency: "daily" }, 428],
    ["new membership", null, { frequency: "monthly" }, 428],
    [
      "cron hour change",
      active("custom_cron", { cronExpression: "0 1 * * *" }),
      { schedule: { frequency: "custom_cron", cron_expression: "0 2 * * *" } },
      428,
    ],
    [
      "custom cron decrease",
      active("custom_cron", { cronExpression: "0 * * * *" }),
      { schedule: { frequency: "custom_cron", cron_expression: "0 1 * * *" } },
      200,
    ],
    ["daily to weekly", active("daily"), { frequency: "weekly" }, 200],
    ["daily to manual", active("daily"), { frequency: "manual" }, 200],
    ["daily to paused", active("daily"), { frequency: "paused" }, 200],
  ] as const)("bulk set_frequency %s", async (_name, checkSchedule, cadence, status) => {
    mocks.findMembership.mockResolvedValue({ checkSchedule });
    const response = await bulkKeywords(
      api("POST", "/api/v1/keywords/bulk", {
        keyword_ids: [keywordId],
        operation: "set_frequency",
        ...cadence,
      }),
    );
    const observed = await statusOf(response);
    expect(observed.status).toBe(status);
    if (status === 428) {
      expect(observed.code).toBe("schedule_review_required");
      expect(observed.wrote).toBe(0);
      expect(mocks.writeAudit).not.toHaveBeenCalled();
    }
  });

  it("prices an equal hour change from the project's connected provider", async () => {
    mocks.providerFindFirst.mockResolvedValue({ provider: "dataforseo" });
    mocks.findMembership.mockResolvedValue({
      checkSchedule: active("custom_cron", { cronExpression: "0 1 * * *" }),
    });
    const response = await patchKeyword(
      api("PATCH", `/api/v1/keywords/${keywordId}`, {
        schedule: { cron_expression: "0 2 * * *", frequency: "custom_cron" },
      }),
      keywordId,
    );
    expect(response.status).toBe(200);
  });
});
