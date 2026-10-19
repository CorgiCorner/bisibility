import { AuthorizationError } from "@/lib/auth/authorize";
import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  loadOverviewMetricData: vi.fn(),
  getQueryActor: vi.fn(() => {
    throw new Error("API must not request a browser session");
  }),
  fetchProjectKeywordVolumes: vi.fn(),
  prisma: {
    keyword: { count: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    rankCheck: { findFirst: vi.fn() },
  },
}));

vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("@/lib/queries/overview-data", () => ({
  loadOverviewMetricData: mocks.loadOverviewMetricData,
}));
vi.mock("@/lib/queries/_auth", () => ({ getQueryActor: mocks.getQueryActor }));

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
    ...recordedFixture(position, {
      observedAt: checkedAt,
      recordedAt: checkedAt,
      configuredScope: { ...fixtureScope, projectId: project.id },
      effectiveScope: { ...fixtureScope, projectId: project.id },
    }),
    publicId: "chk_aaaaaaaaaaaaaaaaaaaaaaaa",
    updatedAt: checkedAt,
    checkedAt,
    normalizationVersion: "v2",
    position,
    previousPosition,
    rankingUrl: position ? "/" : null,
    requestedDepth: 100,
    status: "completed",
  };
}

function keyword(id: string, device: "desktop" | "mobile", checks: ReturnType<typeof rankCheck>[]) {
  return {
    _count: { rankChecks: checks.length },
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    projectId: project.id,
    locationRef: { displayName: "City A", languageCode: "en", languageLabel: "English" },
    device,
    id,
    publicId: `kw_${id.padEnd(24, "a")}`,
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
    mocks.loadOverviewMetricData.mockImplementation(async (_projectId, _filters, asOf) => ({
      keywords: (await mocks.prisma.keyword.findMany()).map(
        (value: ReturnType<typeof keyword>) => ({
          ...value,
          measurementPolicy: {
            asOf,
            expectedScope: value.rankChecks[0]
              ? recordedMeasurement(value.rankChecks[0], value.publicId).effectiveScope
              : null,
            freshForMs: 8 * 86_400_000,
            baselineBefore: new Date(asOf.getTime() - 7 * 86_400_000),
            baselineNotBefore: new Date(asOf.getTime() - 8 * 86_400_000),
            requireCurrentScope: true,
          },
        }),
      ),
      filteredKeywordCount: await mocks.prisma.keyword.count(),
      addedThisMonth: await mocks.prisma.keyword.count(),
      projectDefaults: await mocks.prisma.projectDefaults.findUnique(),
      latestCheck: await mocks.prisma.rankCheck.findFirst(),
      keywordVolumes: new Map(),
    }));
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

  it("excludes an unmeasured keyword from the pinned Visibility denominator", async () => {
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
    expect(body.visibility).toBeCloseTo(33.8333, 4);
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
    expect(mocks.loadOverviewMetricData).toHaveBeenCalledWith(
      project.id,
      { device: "mobile", range: "7d", tag: "Docs" },
      now,
      {
        report: expect.objectContaining({
          context: {
            actor: expect.any(Object),
            transport: "project_key",
            credentialId: "key_1",
            credential: { kind: "project_key", id: "key_1" },
          },
        }),
      },
    );
    expect(mocks.getQueryActor).not.toHaveBeenCalled();

    const invalid = await call("/projects/prj_a00000000000000000000000/overview?range=30d");
    expect(invalid.status).toBe(400);
  });

  it("forbids API keys scoped to another project", async () => {
    const response = await call("/projects/prj_b00000000000000000000000/overview");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "API key is not scoped to this project.",
    });
    expect(mocks.loadOverviewMetricData).not.toHaveBeenCalled();
  });

  it("renews the verified key inside the metadata transaction and refuses revoked credentials", async () => {
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    await call("/projects/prj_a00000000000000000000000/overview");
    const report = mocks.loadOverviewMetricData.mock.calls[0][3].report;
    const apiKey = {
      findFirst: vi.fn(async () => ({ revokedAt: now, expiresAt: null, scopes: ["read"] })),
    };
    const query = vi.fn(async () => []);
    const tx = { apiKey, $queryRaw: query };
    await expect(report.loadMetadata(tx, project, [], now)).rejects.toThrow("authorized");
    expect(apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: "key_1", projectId: project.id },
      select: { revokedAt: true, expiresAt: true, scopes: true },
    });
    expect(query).not.toHaveBeenCalled();
    expect(mocks.getQueryActor).not.toHaveBeenCalled();
  });

  it("returns a forbidden response when access is revoked during the definition read", async () => {
    mocks.loadOverviewMetricData.mockRejectedValueOnce(new AuthorizationError("forbidden"));
    const response = await call("/projects/prj_a00000000000000000000000/overview");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: 403, title: "Forbidden" });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("advertises the overview response and filters in OpenAPI", async () => {
    const response = await call("/openapi.json");
    const body = await response.json();

    expect(body.paths["/projects/{project_id}/overview"].get).toMatchObject({
      operationId: "getProjectOverview",
      parameters: [
        expect.objectContaining({ name: API_VERSION_HEADER }),
        expect.objectContaining({ in: "path", name: "project_id", required: true }),
        expect.objectContaining({
          name: "range",
          schema: {
            default: "28d",
            enum: ["7d", "28d", "90d"],
            type: "string",
            "x-bisibility-enum": "closed",
            "x-bisibility-name": "OverviewRange",
          },
        }),
        expect.objectContaining({
          name: "device",
          schema: {
            default: "all",
            enum: ["all", "desktop", "mobile"],
            type: "string",
            "x-bisibility-enum": "closed",
            "x-bisibility-name": "OverviewDevice",
          },
        }),
        expect.objectContaining({
          name: "tag",
          schema: { maxLength: 48, type: "string" },
        }),
        expect.objectContaining({ $ref: "#/components/parameters/SourceHeader" }),
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
