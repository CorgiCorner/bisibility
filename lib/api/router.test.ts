import { hashApiKey } from "@/lib/providers/crypto";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyForTests } from "./idempotency";
import { resetRateLimitStateForTests } from "./ratelimit";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => {
  type StoredKeyword = {
    device: string;
    id: string;
    locationId: string;
    projectId: string;
    publicId: string;
    schedule: Record<string, unknown> | null;
    text: string;
    [key: string]: unknown;
  };
  const keywordStore = new Map<string, StoredKeyword>();
  let publicIdSequence = 0;
  class RankCheckRunnerError extends Error {
    readonly code: string;

    constructor(code = "provider_failed", message = "Rank check failed.") {
      super(message);
      this.name = "RankCheckRunnerError";
      this.code = code;
    }
  }

  return {
    ProviderChainError: class ProviderChainError extends RankCheckRunnerError {
      readonly attempts: { message: string; provider: string }[];

      constructor(attempts: { message: string; provider: string }[] = []) {
        super("provider_failed", "All providers failed.");
        this.name = "ProviderChainError";
        this.attempts = attempts;
      }
    },
    keywordStore,
    makePublicId: vi.fn((prefix: string) => {
      const suffix = `a${publicIdSequence.toString(36).padStart(23, "0")}`;
      publicIdSequence += 1;
      return `${prefix}_${suffix}`;
    }),
    prisma: {
      $executeRaw: vi.fn(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
      apiKey: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      keyword: {
        count: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      keywordSchedule: { createMany: vi.fn(), upsert: vi.fn() },
      keywordTag: { createMany: vi.fn(), deleteMany: vi.fn() },
      projectDefaults: { findUnique: vi.fn() },
      providerConnection: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      providerConnectionRate: { upsert: vi.fn() },
      rankCheck: { findFirst: vi.fn(), findMany: vi.fn() },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
      webhookEndpoint: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
    persistFailedRankCheck: vi.fn(() => Promise.resolve({ id: "rank_failed_1" })),
    RankCheckRunnerError,
    resolveKeywordLocation: vi.fn(
      async (input: {
        country?: string;
        selection?: { canonicalKey: string };
      }): Promise<import("@/lib/serp/location-resolver").LocationResolution> => {
        const country =
          input.country ?? (input.selection?.canonicalKey === "DE" ? "Germany" : "United States");
        return {
          degraded: false,
          location: {
            canonicalKey: country === "Germany" ? "DE" : "US",
            cityName: null,
            countryCode: country === "Germany" ? "DE" : "US",
            displayName: country,
            gl: country === "Germany" ? "de" : "us",
            hl: country === "Germany" ? "de" : "en",
            id: country === "Germany" ? "loc_de" : "loc_1",
            kind: "country",
            languageLabel: country === "Germany" ? "German" : "English",
            primaryGeoCode: null,
            primaryGeoName: country,
            regionCode: null,
            secondaryGeoName: country,
          },
          warning: null,
        };
      },
    ),
    resetPublicIds: () => {
      publicIdSequence = 0;
    },
    runKeywordCheckWithFallback: vi.fn(),
  };
});

vi.mock("@/lib/actions/_shared", () => ({
  makePublicId: mocks.makePublicId,
  parseActionInput: vi.fn((schema, input) => schema.parse(input)),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn((input, client = mocks.prisma) => client.auditLog.create({ data: input })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

// Stub separately tested location resolution so router dedup keys remain
// deterministic.
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: vi.fn(() => ({ testConnection: async () => ({ ok: true }) })),
  getSerpProvider: vi.fn(() => ({ testConnection: async () => ({ ok: true }) })),
  PROVIDER_CATALOG: [
    { id: "google-search-console", kind: "analytics", label: "Google Search Console" },
    { id: "dataforseo", kind: "serp", label: "DataForSEO" },
    { id: "serpapi", kind: "serp", label: "SerpApi" },
  ],
}));

vi.mock("@/lib/rank-check/runner", () => ({
  persistFailedRankCheck: mocks.persistFailedRankCheck,
  RankCheckRunnerError: mocks.RankCheckRunnerError,
}));

vi.mock("@/lib/rank-check/fallback", () => ({
  ProviderChainError: mocks.ProviderChainError,
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));

const rawKey = "bsb_key_test_1234567890abcdef";

function project() {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    publicId: "prj_a00000000000000000000000",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function authRow() {
  return {
    hashedKey: hashApiKey(rawKey),
    id: "api_key_1",
    name: "Production",
    prefix: rawKey.slice(0, 21),
    project: project(),
    projectId: "project_1",
    revokedAt: null,
  };
}

function keywordRow(id = "kw_a00000000000000000000000") {
  return {
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    device: "desktop",
    id: `keyword_${id}`,
    intent: "commercial",
    location: "United States",
    locationId: "loc_1",
    project: { defaults: null },
    projectId: "project_1",
    publicId: id,
    rankChecks: [],
    schedule: null,
    tags: [{ tag: { name: "Product" } }],
    targetUrl: "https://example.com/page",
    text: "rank tracker",
    topic: "Product",
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  };
}

function webhookRow() {
  return {
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    description: null,
    enabled: true,
    id: "webhook_1",
    lastDeliveryAt: null,
    publicId: "we_a00000000000000000000000",
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    url: "https://93.184.216.34/webhook",
  };
}

function authedRequest(method: string, path: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    method,
  });
}

function rawAuthedRequest(method: string, path: string, body: string, headers: HeadersInit = {}) {
  return new Request(`https://example.test/api/v1${path}`, {
    body,
    headers: {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
      ...headers,
    },
    method,
  });
}

function anonRequest(path: string, headers: HeadersInit = {}) {
  return new Request(`https://example.test/api/v1${path}`, { headers, method: "GET" });
}

async function call(req: Request, path: string) {
  return handleApiRequest(req, path.split("?")[0].split("/").filter(Boolean));
}

describe("public API router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keywordStore.clear();
    mocks.resetPublicIds();
    resetRateLimitStateForTests();
    resetIdempotencyForTests();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "project_1" }]);
    process.env.BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE = "100";
    process.env.BISIBILITY_API_ANON_RATE_LIMIT_PER_MINUTE = "100";
    process.env.REDIS_URL = "";
    mocks.prisma.apiKey.findMany.mockResolvedValue([authRow()]);
    mocks.prisma.apiKey.update.mockResolvedValue({ id: "api_key_1" });
    mocks.prisma.auditLog.create.mockResolvedValue({});
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.keyword.createMany.mockImplementation(({ data }) => {
      for (const item of data) {
        mocks.keywordStore.set(item.id ?? `keyword_${item.publicId}`, {
          ...keywordRow(item.publicId),
          ...item,
          id: item.id ?? `keyword_${item.publicId}`,
          schedule: null,
          tags: [],
        });
      }
      return Promise.resolve({ count: data.length });
    });
    mocks.prisma.keyword.findMany.mockImplementation(({ where = {} } = {}) => {
      const rows = [...mocks.keywordStore.values()];
      if (where.id?.in) {
        return Promise.resolve(rows.filter((row) => where.id.in.includes(row.id)));
      }
      if (where.publicId?.in) {
        return Promise.resolve(rows.filter((row) => where.publicId.in.includes(row.publicId)));
      }
      if (where.locationId?.in && where.device?.in && where.text?.in) {
        return Promise.resolve(
          rows.filter(
            (row) =>
              row.projectId === where.projectId &&
              where.locationId.in.includes(row.locationId) &&
              where.device.in.includes(row.device) &&
              where.text.in.includes(row.text),
          ),
        );
      }
      return Promise.resolve([]);
    });
    mocks.prisma.keyword.findUnique.mockImplementation(({ where }) => {
      if (where.id) {
        return Promise.resolve(mocks.keywordStore.get(where.id) ?? null);
      }
      const key = where.projectId_text_locationId_device;
      if (!key) return Promise.resolve(null);
      return Promise.resolve(
        [...mocks.keywordStore.values()].find(
          (row) =>
            row.projectId === key.projectId &&
            row.text === key.text &&
            row.locationId === key.locationId &&
            row.device === key.device,
        ) ?? null,
      );
    });
    mocks.prisma.keywordSchedule.createMany.mockImplementation(({ data }) => {
      for (const schedule of data) {
        const row = mocks.keywordStore.get(schedule.keywordId);
        if (row) row.schedule = { ...schedule, lastCheckedAt: null };
      }
      return Promise.resolve({ count: data.length });
    });
    mocks.prisma.tag.findMany.mockResolvedValue([{ id: "tag_1", name: "Product" }]);
    mocks.prisma.tag.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue(webhookRow());
    mocks.prisma.webhookEndpoint.update.mockResolvedValue(webhookRow());
    mocks.prisma.keywordTag.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnection.update.mockResolvedValue({});
    mocks.prisma.providerConnection.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        ...create,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
        id: "conn_1",
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      }),
    );
    mocks.prisma.providerConnectionRate.upsert.mockResolvedValue({ id: "rate_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns 401 problem details without a bearer key", async () => {
    const response = await call(anonRequest("/projects"), "/projects");

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({ status: 401, title: "Unauthorized" });
  });

  it("returns 403 when the requested project is outside the key scope", async () => {
    const response = await call(
      authedRequest("GET", "/projects/prj_b00000000000000000000000"),
      "/projects/prj_b00000000000000000000000",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: 403, title: "Forbidden" });
  });

  it("rate limits per API key", async () => {
    process.env.BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE = "1";

    await call(authedRequest("GET", "/projects"), "/projects");
    const response = await call(authedRequest("GET", "/projects"), "/projects");

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1");
  });

  it("replays idempotent writes without running the mutation twice", async () => {
    mocks.prisma.apiKey.create.mockResolvedValue({
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      expiresAt: new Date("2026-04-05T00:00:00.000Z"),
      id: "key_generated",
      lastUsedAt: null,
      name: "CI",
      prefix: "bsb_key_live_12345678",
      publicId: "key_a00000000000000000000000",
      revokedAt: null,
      scopes: ["read", "write", "admin"],
    });
    const headers = { "Idempotency-Key": "idem_1" };

    const first = await call(
      authedRequest("POST", "/api-keys", { name: "CI" }, headers),
      "/api-keys",
    );
    const second = await call(
      authedRequest("POST", "/api-keys", { name: "CI" }, headers),
      "/api-keys",
    );

    expect(first.status).toBe(201);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(second.json()).resolves.toEqual(await first.clone().json());
    expect(mocks.prisma.apiKey.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 problem details for malformed JSON request bodies", async () => {
    const response = await call(rawAuthedRequest("POST", "/api-keys", '{"name":'), "/api-keys");

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      title: "Bad request",
      type: "https://bisibility.com/problems/bad_request",
    });
    expect(mocks.prisma.apiKey.create).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("maps the webhook endpoint cap to the typed HTTP input-error contract", async () => {
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(10);

    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/webhooks", {
        hmac_secret: "1234567890123456",
        url: "https://93.184.216.34/webhook",
      }),
      "/projects/prj_a00000000000000000000000/webhooks",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining("at most 10 webhook endpoints"),
      status: 400,
      title: "Bad request",
      type: "https://bisibility.com/problems/bad_request",
    });
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("rotates webhook secrets without exposing them", async () => {
    const response = await call(
      authedRequest(
        "PATCH",
        "/projects/prj_a00000000000000000000000/webhooks/we_a00000000000000000000000",
        {
          hmac_secret: "test-secret-test-secret",
        },
      ),
      "/projects/prj_a00000000000000000000000/webhooks/we_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.not.toHaveProperty("hmac_secret");
    expect(mocks.prisma.webhookEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hmacSecret: expect.not.stringMatching(/^test-secret-test-secret$/),
        }),
      }),
    );
  });

  it.each([null, ""])("rejects webhook secret rotation value %j", async (hmacSecret) => {
    const response = await call(
      authedRequest(
        "PATCH",
        "/projects/prj_a00000000000000000000000/webhooks/we_a00000000000000000000000",
        {
          hmac_secret: hmacSecret,
        },
      ),
      "/projects/prj_a00000000000000000000000/webhooks/we_a00000000000000000000000",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      title: "Validation failed",
    });
    expect(mocks.prisma.webhookEndpoint.update).not.toHaveBeenCalled();
  });

  it("lists keywords with pagination and filters", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keywordRow("kw_a00000000000000000000000"),
      keywordRow("kw_b00000000000000000000000"),
    ]);

    const response = await call(
      authedRequest(
        "GET",
        "/projects/prj_a00000000000000000000000/keywords?limit=1&search=rank&filter%5Bdevice%5D=desktop&topic=Product&filter%5Bintent%5D=commercial",
      ),
      "/projects/prj_a00000000000000000000000/keywords",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta.next_cursor).toEqual(expect.any(String));
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          device: "desktop",
          intent: { equals: "commercial", mode: "insensitive" },
          projectId: "project_1",
          text: { contains: "rank", mode: "insensitive" },
          topic: { equals: "Product", mode: "insensitive" },
        }),
      }),
    );
  });

  it("returns keyword-specific next times for inherited project schedules", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const defaults = {
      cronExpression: null,
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      nextCheckAt: new Date("2026-07-29T06:00:00.000Z"),
      timezone: "UTC",
    };
    const first = {
      ...keywordRow("kw_a00000000000000000000000"),
      project: { defaults },
    };
    const second = {
      ...keywordRow("kw_b00000000000000000000000"),
      project: { defaults },
    };
    mocks.prisma.keyword.findMany.mockResolvedValue([first, second]);

    const response = await call(
      authedRequest("GET", "/projects/prj_a00000000000000000000000/keywords"),
      "/projects/prj_a00000000000000000000000/keywords",
    );
    const body = await response.json();
    const nextTimes = body.data.map(
      (keyword: { schedule: { next_check_at: string } }) => keyword.schedule.next_check_at,
    );

    expect(response.status).toBe(200);
    expect(nextTimes).toHaveLength(2);
    expect(nextTimes[0]).not.toBe(nextTimes[1]);
  });

  it("rejects invalid keyword topic filters", async () => {
    const topic = "x".repeat(81);
    const response = await call(
      authedRequest("GET", `/projects/prj_a00000000000000000000000/keywords?topic=${topic}`),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "topic must be a non-empty string up to 80 characters.",
    });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("matches canonical country filters against legacy stored aliases", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keywordRow("kw_a00000000000000000000000")]);

    const response = await call(
      authedRequest(
        "GET",
        "/projects/prj_a00000000000000000000000/keywords?country=United%20States",
      ),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { location: { equals: "United States", mode: "insensitive" } },
                { location: { equals: "US", mode: "insensitive" } },
                { location: { equals: "USA", mode: "insensitive" } },
                { location: { equals: "United States of America", mode: "insensitive" } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("creates keywords with partial success and reads the created keyword", async () => {
    const existing = keywordRow("kw_d00000000000000000000000");
    existing.text = "existing keyword";
    mocks.keywordStore.set(existing.id, existing);

    const createResponse = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", [
        { intent: "commercial", keyword: "rank tracker", tags: ["Product"], topic: "Product" },
        { keyword: "existing keyword" },
      ]),
      "/projects/prj_a00000000000000000000000/keywords",
    );
    const createBody = await createResponse.json();
    const created = [...mocks.keywordStore.values()].find((row) => row.text === "rank tracker");
    mocks.prisma.keyword.findFirst.mockResolvedValue(created);
    const getResponse = await call(
      authedRequest("GET", "/keywords/kw_a00000000000000000000000"),
      "/keywords/kw_a00000000000000000000000",
    );

    expect(createResponse.status).toBe(201);
    expect(createBody.created).toBe(1);
    expect(createBody.skipped).toBe(1);
    expect(createBody.results[0].keyword).toMatchObject({
      intent: "commercial",
      topic: "Product",
    });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ intent: "commercial", text: "rank tracker", topic: "Product" }),
        ],
      }),
    );
    await expect(getResponse.json()).resolves.toMatchObject({ id: "kw_a00000000000000000000000" });
  });

  it("allows a REST keyword batch exactly at the configured project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "2");
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", {
        keyword: "rank tracker",
      }),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("rejects a REST keyword batch atomically above the configured project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "2");
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", [
        { keyword: "rank tracker" },
        { keyword: "seo tool" },
      ]),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      detail: "This project is limited to 2 keywords. Delete keywords before adding more.",
      status: 403,
      title: "Forbidden",
      type: "https://bisibility.com/problems/forbidden",
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("persists a valid 500-keyword REST request with one bounded capacity pass", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "500");
    const items = Array.from({ length: 500 }, (_, index) => ({
      keyword: `keyword ${index.toString().padStart(3, "0")}`,
    }));

    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", items),
      "/projects/prj_a00000000000000000000000/keywords",
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ created: 500, skipped: 0 });
    expect(body.results).toHaveLength(500);
    expect(body.results.map((item: { keyword: { text: string } }) => item.keyword.text)).toEqual(
      items.map((item) => item.keyword),
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.count).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("handles a mixed duplicate and net-new REST batch at the cap in one capacity pass", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "2");
    const existing = keywordRow("kw_d00000000000000000000000");
    existing.text = "existing keyword";
    mocks.keywordStore.set(existing.id, existing);
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", [
        { keyword: "existing keyword" },
        { keyword: "new keyword" },
      ]),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ created: 1, skipped: 1 });
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.count).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("creates keywords with project defaults when country and device are omitted", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: null,
      country: "Germany",
      device: "mobile",
      locationKey: "DE",
    });
    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", {
        keyword: "rank tracker",
      }),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(201);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "DE", kind: "city" },
    });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            device: "mobile",
            location: "Germany",
            locationId: "loc_de",
          }),
        ],
      }),
    );
  });

  it("executes documented snake-case schedules for keyword creation", async () => {
    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", {
        keyword: "rank tracker",
        schedule: {
          cron_expression: "15 6 * * 1",
          frequency: "custom_cron",
          jitter_minutes: 0,
          timezone: "Europe/Warsaw",
        },
      }),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ text: "rank tracker" })],
      }),
    );
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            cronExpression: "15 6 * * 1",
            frequency: "custom_cron",
            jitterMinutes: 0,
          }),
        ],
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      results: [
        {
          keyword: {
            schedule: {
              cron_expression: "15 6 * * 1",
              jitter_minutes: 0,
            },
          },
        },
      ],
    });
  });

  it("creates keywords with location_key and returns resolver warnings", async () => {
    const warning = 'Could not resolve "Austin" in United States; tracking at country level.';
    mocks.resolveKeywordLocation.mockResolvedValueOnce({
      degraded: true,
      location: {
        canonicalKey: "US",
        cityName: null,
        countryCode: "US",
        displayName: "United States",
        gl: "us",
        hl: "en",
        id: "loc_1",
        kind: "country",
        languageLabel: "English",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        regionCode: null,
        secondaryGeoName: "United States",
      },
      warning,
    });
    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", {
        keyword: "rank tracker",
        location_key: "US/Texas/Austin",
      }),
      "/projects/prj_a00000000000000000000000/keywords",
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
    expect(body.warnings).toEqual([warning]);
    expect(body.results[0]).toMatchObject({ status: "created", warning });
  });

  it("patches keyword location with location_key", async () => {
    const existing = keywordRow("kw_a00000000000000000000000");
    const updated = {
      ...existing,
      intent: "informational",
      location: "Austin, Texas, United States",
      topic: "Docs",
    };
    mocks.resolveKeywordLocation.mockResolvedValueOnce({
      degraded: false,
      location: {
        canonicalKey: "US/Texas/Austin",
        cityName: "Austin",
        countryCode: "US",
        displayName: "Austin, Texas, United States",
        gl: "us",
        hl: "en",
        id: "loc_austin",
        kind: "city",
        languageLabel: "English",
        primaryGeoCode: 1026201,
        primaryGeoName: "Austin",
        regionCode: "US-TX",
        secondaryGeoName: "Texas",
      },
      warning: null,
    });
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    mocks.prisma.keyword.update.mockResolvedValue(updated);

    const response = await call(
      authedRequest("PATCH", "/keywords/kw_a00000000000000000000000", {
        intent: "informational",
        location_key: "US/Texas/Austin",
        topic: "Docs",
      }),
      "/keywords/kw_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
    expect(mocks.prisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intent: "informational",
          location: "Austin, Texas, United States",
          locationId: "loc_austin",
          topic: "Docs",
        }),
      }),
    );
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: expect.objectContaining({ intent: "informational", topic: "Docs" }),
        before: expect.objectContaining({ intent: "commercial", topic: "Product" }),
      }),
    });
  });

  it("runs a single-keyword rank check through the runner", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.runKeywordCheckWithFallback.mockResolvedValue({
      rankCheck: {
        checkedAt: new Date("2026-01-06T00:00:00.000Z"),
        costCents: 0.06,
        id: "check_a00000000000000000000000",
        keywordId: "keyword_1",
        position: 4,
        previousPosition: 8,
        provider: "dataforseo",
        publicId: "check_a00000000000000000000000",
        rankingUrl: "https://example.com/page",
        status: "completed",
      },
    });

    const response = await call(
      authedRequest("POST", "/keywords/kw_a00000000000000000000000/checks", {}),
      "/keywords/kw_a00000000000000000000000/checks",
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      id: "check_a00000000000000000000000",
      keyword_id: "kw_a00000000000000000000000",
      position: 4,
    });
    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      providerId: undefined,
    });
  });

  it("deletes keywords and writes audit in one transaction", async () => {
    const keyword = keywordRow("kw_a00000000000000000000000");
    mocks.prisma.keyword.findFirst.mockResolvedValue(keyword);
    mocks.prisma.keyword.delete.mockResolvedValue(keyword);

    const response = await call(
      authedRequest("DELETE", "/keywords/kw_a00000000000000000000000"),
      "/keywords/kw_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.delete).toHaveBeenCalledWith({
      where: { id: "keyword_kw_a00000000000000000000000" },
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "keyword.delete",
        targetId: "kw_a00000000000000000000000",
      }),
    });
  });

  it("maps exhausted rank-check budgets to a 429 problem response", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new BudgetExhaustedError({ capCents: 1, projectId: "project_1", spentCents: 1 }),
    );

    const response = await call(
      authedRequest("POST", "/keywords/kw_a00000000000000000000000/checks", {}),
      "/keywords/kw_a00000000000000000000000/checks",
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Rank check monthly budget reached.",
      status: 429,
      title: "Budget exhausted",
      type: "https://bisibility.com/problems/budget_exhausted",
    });
    expect(mocks.persistFailedRankCheck).not.toHaveBeenCalled();
  });

  it("maps provider rate limits to 429 problem details with retry headers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-06T00:00:00.000Z"));
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new ProviderRateLimitedError("serpapi", {
        accountKey: "serpapi:test",
        resetAt: new Date("2026-01-06T00:00:45.000Z").getTime(),
      }),
    );

    const response = await call(
      authedRequest("POST", "/keywords/kw_a00000000000000000000000/checks", {}),
      "/keywords/kw_a00000000000000000000000/checks",
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(response.headers.get("RateLimit-Reset")).toBe("45");
    await expect(response.json()).resolves.toMatchObject({
      detail: "Provider rate limit reached; retry shortly.",
      status: 429,
      title: "Rate limit exceeded",
      type: "https://bisibility.com/problems/rate_limited",
    });
  });

  it("maps rank-check runner provider failures to a 502 problem response", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new mocks.RankCheckRunnerError("provider_failed", "provider unavailable"),
    );

    const response = await call(
      authedRequest("POST", "/keywords/kw_a00000000000000000000000/checks", {
        provider_id: "serpapi",
      }),
      "/keywords/kw_a00000000000000000000000/checks",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Rank check provider request failed.",
      status: 502,
      title: "Provider unavailable",
      type: "https://bisibility.com/problems/provider_unavailable",
    });
    expect(mocks.persistFailedRankCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "provider unavailable",
        keywordId: "keyword_1",
        keywordPublicId: "kw_a00000000000000000000000",
        provider: "serpapi",
      }),
    );
  });

  it("executes documented snake-case schedules for patch and bulk requests", async () => {
    const existing = keywordRow("kw_a00000000000000000000000");
    mocks.prisma.keyword.findFirst.mockResolvedValue(existing);
    mocks.prisma.keyword.update.mockResolvedValue(existing);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: existing.id, publicId: existing.publicId },
    ]);
    mocks.prisma.keywordSchedule.upsert.mockResolvedValue({});

    const patchResponse = await call(
      authedRequest("PATCH", "/keywords/kw_a00000000000000000000000", {
        schedule: {
          cron_expression: "0 7 * * *",
          frequency: "custom_cron",
          jitter_minutes: 0,
          timezone: "UTC",
        },
      }),
      "/keywords/kw_a00000000000000000000000",
    );
    const bulkResponse = await call(
      authedRequest("POST", "/keywords/bulk", {
        keyword_ids: [existing.publicId],
        operation: "set_frequency",
        schedule: {
          cron_expression: "30 8 * * 1",
          frequency: "custom_cron",
          jitter_minutes: 0,
          timezone: "UTC",
        },
      }),
      "/keywords/bulk",
    );

    expect(patchResponse.status).toBe(200);
    expect(bulkResponse.status).toBe(200);
    expect(mocks.prisma.keywordSchedule.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          cronExpression: "0 7 * * *",
          jitterMinutes: 0,
        }),
      }),
    );
    expect(mocks.prisma.keywordSchedule.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          cronExpression: "30 8 * * 1",
          jitterMinutes: 0,
        }),
      }),
    );
  });

  it("maps rank-check runner missing keywords to a 404 problem response", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new mocks.RankCheckRunnerError("keyword_not_found", "Keyword no longer exists."),
    );

    const response = await call(
      authedRequest("POST", "/keywords/kw_a00000000000000000000000/checks", {}),
      "/keywords/kw_a00000000000000000000000/checks",
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Keyword no longer exists.",
      status: 404,
      title: "Provider unavailable",
      type: "https://bisibility.com/problems/provider_unavailable",
    });
    expect(mocks.persistFailedRankCheck).not.toHaveBeenCalled();
  });

  it("connects providers with API-key auth without using session actions", async () => {
    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/providers/serpapi/connect", {
        cost_per_check: 0.01,
        credentials: { api_key: "secret" },
        primary: true,
      }),
      "/projects/prj_a00000000000000000000000/providers/serpapi/connect",
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      connection_id: expect.stringMatching(/^conn_[a-z][a-z0-9]{23}$/),
      cost_per_check_cents: 1,
      id: "serpapi",
      provider: "serpapi",
    });
    expect(body).not.toHaveProperty("credentials_encrypted");
    expect(body).not.toHaveProperty("project_id");
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: { id: true, provider: true },
      where: { kind: "serp", projectId: "project_1" },
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "provider.connect",
        projectId: "project_1",
        targetId: expect.stringMatching(/^conn_[a-z][a-z0-9]{23}$/),
      }),
    });
    expect(mocks.prisma.providerConnectionRate.upsert).toHaveBeenCalledWith({
      create: {
        amountCents: 1,
        connectionId: "conn_1",
        feature: "rank_check",
      },
      update: { amountCents: 1 },
      where: {
        connectionId_feature: {
          connectionId: "conn_1",
          feature: "rank_check",
        },
      },
    });
  });

  it("does not serialize raw provider connection data after settings updates", async () => {
    const connection = {
      costPerCheckCents: 1,
      credentialsEncrypted: "encrypted-provider-secret",
      enabled: true,
      id: "connection_db_1",
      kind: "serp",
      priority: 4,
      projectId: "project_1",
      provider: "serpapi",
      publicId: "conn_a00000000000000000000000",
      status: "connected",
    };
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection);
    mocks.prisma.providerConnection.update.mockResolvedValue({ ...connection, enabled: false });

    const response = await call(
      authedRequest("PATCH", "/projects/prj_a00000000000000000000000/providers/serpapi", {
        enabled: false,
      }),
      "/projects/prj_a00000000000000000000000/providers/serpapi",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      connection_id: "conn_a00000000000000000000000",
      enabled: false,
      id: "serpapi",
      provider: "serpapi",
    });
    expect(body).not.toHaveProperty("credentials_encrypted");
    expect(body).not.toHaveProperty("project_id");
  });

  it("lists providers with API-key project scope", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 1,
        enabled: true,
        kind: "serp",
        lastUsedAt: new Date("2026-01-05T00:00:00.000Z"),
        priority: 0,
        provider: "serpapi",
        publicId: "conn_a00000000000000000000000",
        status: "connected",
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
      {
        costPerCheckCents: null,
        enabled: true,
        kind: "analytics",
        lastUsedAt: new Date("2026-01-05T00:00:00.000Z"),
        priority: 0,
        provider: "google-search-console",
        publicId: "conn_b00000000000000000000000",
        status: "connected",
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    ]);

    const response = await call(
      authedRequest("GET", "/projects/prj_a00000000000000000000000/providers"),
      "/projects/prj_a00000000000000000000000/providers",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category_id: "serp",
          connection_id: "conn_a00000000000000000000000",
          id: "serpapi",
          primary: true,
          status: "connected",
        }),
        expect.objectContaining({
          category_id: "analytics",
          connection_id: "conn_b00000000000000000000000",
          id: "google-search-console",
          status: "connected",
        }),
      ]),
    );
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1" } }),
    );
  });

  it.each(["connection_db_1", "key_a00000000000000000000000"])(
    "fails closed when a connected provider has invalid public ID %s",
    async (publicId) => {
      mocks.prisma.providerConnection.findMany.mockResolvedValue([
        {
          costPerCheckCents: 1,
          enabled: true,
          kind: "serp",
          lastUsedAt: null,
          priority: 0,
          provider: "serpapi",
          publicId,
          status: "connected",
          updatedAt: new Date("2026-01-05T00:00:00.000Z"),
        },
      ]);

      const response = await call(
        authedRequest("GET", "/projects/prj_a00000000000000000000000/providers"),
        "/projects/prj_a00000000000000000000000/providers",
      );
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(body).not.toContain(publicId);
    },
  );

  it("returns validation errors as problem json", async () => {
    const response = await call(
      authedRequest("POST", "/projects/prj_a00000000000000000000000/keywords", { keyword: "" }),
      "/projects/prj_a00000000000000000000000/keywords",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errors: expect.any(Object),
      status: 400,
      title: "Validation failed",
    });
  });

  it("returns 404 for the removed jobs route", async () => {
    const response = await call(authedRequest("GET", "/jobs/job_1"), "/jobs/job_1");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ title: "Not found" });
  });

  it("keeps undeclared requests working without API-key auth", async () => {
    const openapi = await call(anonRequest("/openapi.json"), "/openapi.json");
    const capabilities = await call(anonRequest("/capabilities"), "/capabilities");

    expect(openapi.status).toBe(200);
    expect(capabilities.status).toBe(200);
    await expect(openapi.json()).resolves.toMatchObject({
      openapi: "3.1.0",
      paths: expect.objectContaining({ "/projects/{project_id}/keywords": expect.any(Object) }),
    });
    await expect(capabilities.json()).resolves.toMatchObject({
      apiVersions: ["v1"],
      scheduler_driver: "legacy-auto",
      data: expect.arrayContaining([
        expect.objectContaining({
          input_schema: expect.objectContaining({
            properties: expect.objectContaining({
              country: expect.objectContaining({
                enum: expect.arrayContaining(["United States", "Germany", "Poland"]),
              }),
              device: expect.objectContaining({ enum: ["desktop", "mobile"] }),
            }),
          }),
          operationId: "addKeywords",
        }),
      ]),
    });
  });

  it("accepts requests declaring a served API version", async () => {
    const response = await call(
      anonRequest("/capabilities", { "Bisibility-API-Version": "v1" }),
      "/capabilities",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ apiVersions: ["v1"] });
  });

  it("returns an explicit version error for an unserved declared API version", async () => {
    const response = await call(
      anonRequest("/capabilities", { "Bisibility-API-Version": "v2" }),
      "/capabilities",
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      detail: "The declared API version v2 is not served by this server.",
      errors: {
        apiVersions: ["v1"],
        declaredApiVersion: "v2",
      },
      status: 409,
      title: "Unsupported API version",
      type: "https://bisibility.com/problems/unsupported_api_version",
    });
  });
});
