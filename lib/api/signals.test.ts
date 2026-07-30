import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  emitSignal: vi.fn(),
  prisma: {
    keyword: { findFirst: vi.fn() },
    signal: { findMany: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_a00000000000000000000000",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const happenedAt = new Date("2026-07-04T19:30:00.000Z");
const createdAt = new Date("2026-07-04T19:31:00.000Z");

function signalRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt,
    happenedAt,
    id: "signal_1",
    payload: { version: "1.2.3" },
    publicId: "sig_a00000000000000000000000",
    severity: "warning",
    source: "deploy",
    type: "deploy.completed",
    url: "https://example.com/releases/1",
    ...overrides,
  };
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.com/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

function routePath(path: string) {
  return path.split("?")[0].split("/").filter(Boolean);
}

async function call(method: string, path: string, body?: unknown) {
  return handleApiRequest(request(method, path, body), routePath(path));
}

describe("signal API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project,
    });
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
    });
    mocks.prisma.signal.findMany.mockResolvedValue([]);
    mocks.emitSignal.mockResolvedValue(signalRow());
  });

  it("ingests a signal with public ids and snake_case fields", async () => {
    const response = await call("POST", "/signals", {
      happened_at: happenedAt.toISOString(),
      keyword_id: "kw_a00000000000000000000000",
      payload: { version: "1.2.3" },
      severity: "warning",
      source: "deploy",
      type: "deploy.completed",
      url: "https://example.com/releases/1",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      created_at: createdAt.toISOString(),
      happened_at: happenedAt.toISOString(),
      id: "sig_a00000000000000000000000",
      keyword_id: "kw_a00000000000000000000000",
      project_id: "prj_a00000000000000000000000",
      public_id: "sig_a00000000000000000000000",
    });
    expect(body).not.toHaveProperty("createdAt");
    expect(mocks.prisma.keyword.findFirst).toHaveBeenCalledWith({
      select: { id: true, publicId: true },
      where: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
    });
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        happenedAt,
        keywordId: "keyword_1",
        payload: { version: "1.2.3" },
        projectId: "project_1",
        source: "deploy",
        type: "deploy.completed",
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signal.ingested",
        actorId: null,
        projectId: "project_1",
        targetId: "sig_a00000000000000000000000",
        targetType: "signal",
      }),
    );
  });

  it.each([
    ["bad source", { source: "manual", type: "deploy.completed" }],
    ["bad type", { source: "deploy", type: "deploy" }],
    [
      "oversized payload",
      { payload: { value: "x".repeat(8200) }, source: "deploy", type: "deploy.completed" },
    ],
    [
      "non-http url scheme",
      { source: "deploy", type: "deploy.completed", url: "javascript:alert(1)" },
    ],
  ])("returns a validation problem for %s", async (_label, body) => {
    const response = await call("POST", "/signals", body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errors: expect.any(Object),
      status: 400,
      title: "Validation failed",
    });
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown keyword public id", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(null);

    const response = await call("POST", "/signals", {
      keyword_id: "kw_z00000000000000000000000",
      source: "api",
      type: "api.changed",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Keyword not found.",
      title: "Not found",
    });
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it.each(["keyword_db_1", "sig_a00000000000000000000000"])(
    "rejects keyword ID %s before querying or emitting",
    async (keywordId) => {
      const response = await call("POST", "/signals", {
        keyword_id: keywordId,
        source: "api",
        type: "api.changed",
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        title: "Invalid public ID",
      });
      expect(mocks.prisma.keyword.findFirst).not.toHaveBeenCalled();
      expect(mocks.emitSignal).not.toHaveBeenCalled();
    },
  );

  it("lists project signals newest first with filters and cursor pagination", async () => {
    mocks.prisma.signal.findMany.mockResolvedValue([
      signalRow({
        id: "signal_2",
        keyword: { publicId: "kw_b00000000000000000000000" },
        publicId: "sig_b00000000000000000000000",
      }),
      signalRow({ id: "signal_1", publicId: "sig_a00000000000000000000000" }),
    ]);

    const response = await call(
      "GET",
      "/projects/prj_a00000000000000000000000/signals?source=deploy&type=deploy.completed&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-05T00%3A00%3A00.000Z&limit=1",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: [
        expect.objectContaining({
          keyword_id: "kw_b00000000000000000000000",
          public_id: "sig_b00000000000000000000000",
        }),
      ],
      meta: { next_cursor: expect.any(String) },
    });
    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ happenedAt: "desc" }, { publicId: "desc" }],
        take: 2,
        where: {
          AND: expect.arrayContaining([
            { projectId: "project_1" },
            { source: "deploy" },
            { type: "deploy.completed" },
            {
              happenedAt: {
                gte: new Date("2026-07-01T00:00:00.000Z"),
                lte: new Date("2026-07-05T00:00:00.000Z"),
              },
            },
          ]),
        },
      }),
    );
  });
});
