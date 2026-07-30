import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  fetchProjectKeywordVolumes: vi.fn(),
  prisma: {
    keyword: { count: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    rankCheck: { findFirst: vi.fn() },
  },
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/keyword-metrics-query", () => ({
  fetchProjectKeywordVolumes: mocks.fetchProjectKeywordVolumes,
}));

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "user_1",
  publicId: "prj_a00000000000000000000000",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  writeMode: "active",
};
const now = new Date("2026-07-27T12:00:00.000Z");

function rankCheck(position: number | null, previousPosition: number | null, checkedAt: Date) {
  return {
    checkedAt,
    position,
    previousPosition,
    rankingUrl: position ? "/" : null,
    status: "completed",
  };
}

function keyword(id: string, device: "desktop" | "mobile", checks: ReturnType<typeof rankCheck>[]) {
  return {
    _count: { rankChecks: checks.length },
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    device,
    id,
    publicId: `kw_${id}`,
    rankChecks: checks,
    schedule: null,
    text: id,
  };
}

function request(path: string) {
  return new Request(`https://example.com/api/v1${path}`, {
    headers: { authorization: "Bearer bsb_key_live_test_key" },
  });
}

async function call(path: string) {
  return handleApiRequest(request(path), path.split("?")[0].split("/").filter(Boolean));
}

describe("project overview API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["read"],
      },
      project,
    });
    mocks.fetchProjectKeywordVolumes.mockResolvedValue(new Map());
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      nextCheckAt: new Date("2026-07-28T06:00:00.000Z"),
    });
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      checkedAt: new Date("2026-07-27T10:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns computed numeric overview metrics", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("one", "desktop", [
        rankCheck(2, null, new Date("2026-07-27T10:00:00.000Z")),
        rankCheck(12, null, new Date("2026-07-20T10:00:00.000Z")),
      ]),
      keyword("two", "desktop", [
        rankCheck(10, null, new Date("2026-07-27T10:00:00.000Z")),
        rankCheck(8, null, new Date("2026-07-20T10:00:00.000Z")),
      ]),
      keyword("pending", "desktop", []),
    ]);

    const response = await call("/projects/prj_a00000000000000000000000/overview");
    const body = await response.json();
    const nextCheckAt = ["one", "two", "pending"]
      .map((id) => computeNextCheckAt({ frequency: "daily" }, now, id))
      .filter((value): value is Date => value !== null)
      .sort((left, right) => left.getTime() - right.getTime())[0];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      average_position: 6,
      average_position_delta: 4,
      keywords_added_this_month: 1,
      last_check_at: "2026-07-27T10:00:00.000Z",
      next_check_at: nextCheckAt.toISOString(),
      position_distribution: [
        { count: 1, max: 3, min: 1 },
        { count: 1, max: 10, min: 4 },
        { count: 0, max: 20, min: 11 },
        { count: 0, max: 50, min: 21 },
        { count: 0, max: 100, min: 51 },
      ],
      project_id: "prj_a00000000000000000000000",
      top_3_count: 1,
      top_10_count: 2,
      top_10_delta: 1,
      top_100_count: 2,
      tracked_keyword_count: 3,
    });
    expect(body.visibility).toBeCloseTo(22.5556, 4);
    expect(body.visibility_delta).toBeCloseTo(22.5, 4);
  });

  it("returns null rank metrics when the project has no checks", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("one", "desktop", []),
      keyword("two", "mobile", []),
    ]);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);

    const response = await call("/projects/prj_a00000000000000000000000/overview");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      average_position: null,
      average_position_delta: null,
      keywords_added_this_month: 0,
      last_check_at: null,
      position_distribution: [
        { count: null, max: 3, min: 1 },
        { count: null, max: 10, min: 4 },
        { count: null, max: 20, min: 11 },
        { count: null, max: 50, min: 21 },
        { count: null, max: 100, min: 51 },
      ],
      top_3_count: null,
      top_10_count: null,
      top_10_delta: null,
      top_100_count: null,
      tracked_keyword_count: 2,
      visibility: null,
      visibility_delta: null,
    });
  });

  it("returns real zero counts for completed checks outside the top 100", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("outside", "desktop", [rankCheck(null, null, new Date("2026-07-27T10:00:00.000Z"))]),
    ]);

    const response = await call("/projects/prj_a00000000000000000000000/overview");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      average_position: null,
      position_distribution: [
        { count: 0, max: 3, min: 1 },
        { count: 0, max: 10, min: 4 },
        { count: 0, max: 20, min: 11 },
        { count: 0, max: 50, min: 21 },
        { count: 0, max: 100, min: 51 },
      ],
      top_3_count: 0,
      top_10_count: 0,
      top_100_count: 0,
      visibility: 0,
    });
  });

  it("validates and applies range, device, and tag filters", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("mobile", "mobile", [rankCheck(3, null, new Date("2026-07-27T10:00:00.000Z"))]),
    ]);

    const response = await call(
      "/projects/prj_a00000000000000000000000/overview?range=7d&device=mobile&tag=Docs",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({
            where: expect.objectContaining({
              checkedAt: { gte: new Date("2026-06-28T00:00:00.000Z") },
            }),
          }),
        }),
        where: {
          device: "mobile",
          projectId: "project_1",
          tags: { some: { tag: { name: "Docs" } } },
        },
      }),
    );

    const invalid = await call("/projects/prj_a00000000000000000000000/overview?range=30d");
    expect(invalid.status).toBe(400);
  });

  it("forbids API keys scoped to another project", async () => {
    const response = await call("/projects/prj_b00000000000000000000000/overview");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "API key is not scoped to this project.",
    });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("advertises the overview response and filters in OpenAPI", async () => {
    const response = await call("/openapi.json");
    const body = await response.json();

    expect(body.paths["/projects/{project_id}/overview"].get).toMatchObject({
      operationId: "getProjectOverview",
      parameters: [
        expect.objectContaining({
          name: "range",
          schema: { default: "28d", enum: ["7d", "28d", "90d"], type: "string" },
        }),
        expect.objectContaining({
          name: "device",
          schema: {
            default: "all",
            enum: ["all", "desktop", "mobile"],
            type: "string",
          },
        }),
        expect.objectContaining({
          name: "tag",
          schema: { maxLength: 48, type: "string" },
        }),
      ],
      responses: {
        "200": expect.objectContaining({
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProjectOverview" },
            },
          },
        }),
      },
    });
    expect(body.components.schemas.ProjectOverview).toMatchObject({
      properties: {
        average_position: { type: ["number", "null"] },
        position_distribution: {
          items: {
            properties: {
              count: { type: ["integer", "null"] },
              max: { type: "integer" },
              min: { type: "integer" },
            },
            type: "object",
          },
          type: "array",
        },
        visibility: { type: ["number", "null"] },
      },
      type: "object",
    });
  });
});
