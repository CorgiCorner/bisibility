import { hashApiKey } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyForTests } from "./idempotency";
import { resetRateLimitStateForTests } from "./ratelimit";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: { findMany: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn(), update: vi.fn() },
    sitemapSnapshot: { findFirst: vi.fn() },
    triggeredAlert: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  requireSession: vi.fn(() => {
    throw new Error("REST path must not read session state");
  }),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
  writeAuditFailure: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.requireSession,
  requireRole: mocks.requireSession,
  requireSession: mocks.requireSession,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawKey = "bsb_key_test_loop_closure_123456";
const alertPublicId = "al_abcdefghijklmnopqrstuvwx";
const missingAlertPublicId = "al_zyxwvutsrqponmlkjihgfedc";
const otherProjectPublicId = "prj_zyxwvutsrqponmlkjihgfedc";
let scopes: ("admin" | "read" | "write")[] = ["admin"];

function project() {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
    sitemapMonitoringEnabled: true,
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    writeMode: "active",
  };
}

function authRow() {
  return {
    hashedKey: hashApiKey(rawKey),
    id: "api_key_1",
    name: "Loop closure",
    prefix: rawKey.slice(0, 21),
    project: project(),
    projectId: "project_1",
    revokedAt: null,
    scopes,
  };
}

function request(method: string, path: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request(`https://api.example.com/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    method,
  });
}

function call(method: string, path: string, body?: unknown, headers?: HeadersInit) {
  return handleApiRequest(
    request(method, path, body, headers),
    path.split("?")[0].split("/").filter(Boolean),
  );
}

describe("loop-closure API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetIdempotencyForTests();
    resetRateLimitStateForTests();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE = "100";
    scopes = ["admin"];
    mocks.prisma.apiKey.findMany.mockImplementation(() => Promise.resolve([authRow()]));
    mocks.prisma.apiKey.update.mockResolvedValue({ id: "api_key_1" });
    mocks.prisma.project.findFirst.mockResolvedValue(project());
    mocks.prisma.project.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...project(), sitemapMonitoringEnabled: data.sitemapMonitoringEnabled }),
    );
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({
      id: "alert_1",
      publicId: alertPublicId,
      snoozedUntil: null,
      status: "firing",
    });
    mocks.prisma.triggeredAlert.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "alert_1",
        publicId: alertPublicId,
        snoozedUntil: data.snoozedUntil,
        status: "firing",
      }),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "keyword_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        rankChecks: [
          {
            checkedAt: new Date("2026-07-20T10:00:00.000Z"),
            id: "check_1",
            position: 4,
            previousPosition: 7,
            publicId: "check_abcdefghijklmnopqrstuvwx",
            rankingUrl: "https://example.com/rank",
          },
        ],
        tags: [],
        text: "rank tracker",
      },
    ]);
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
      fetchedAt: new Date("2026-07-21T04:45:00.000Z"),
      id: "snapshot_1",
      sitemapUrl: "https://example.com/sitemap.xml",
      urlCount: 42,
    });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("marks all firing alerts read with write authorization and audit parity", async () => {
    const response = await call(
      "POST",
      "/projects/prj_abcdefghijklmnopqrstuvwx/triggered-alerts/mark-read",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ updated: 2 });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "triggered_alert.mark_all_read", actorId: null }),
    );
    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("mutes one alert and maps an unknown alert to problem details", async () => {
    const response = await call(
      "POST",
      `/projects/prj_abcdefghijklmnopqrstuvwx/triggered-alerts/${alertPublicId}/mute`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      muted: true,
      snoozed_until: expect.any(String),
    });

    mocks.prisma.triggeredAlert.findFirst.mockResolvedValueOnce(null);
    const missing = await call(
      "POST",
      `/projects/prj_abcdefghijklmnopqrstuvwx/triggered-alerts/${missingAlertPublicId}/mute`,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/problem+json");
  });

  it("exports capped JSON with UI filters and checked_at", async () => {
    const response = await call(
      "GET",
      "/projects/prj_abcdefghijklmnopqrstuvwx/exports/rank-history?keyword_id=kw_abcdefghijklmnopqrstuvwx&range=90&granularity=daily&limit=1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          checked_at: "2026-07-20T10:00:00.000Z",
          id: "check_abcdefghijklmnopqrstuvwx",
          keyword_id: "kw_abcdefghijklmnopqrstuvwx",
        },
      ],
      meta: { next_cursor: null },
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicId: { in: ["kw_abcdefghijklmnopqrstuvwx"] },
        }),
      }),
    );
  });

  it("streams CSV with download and rate-limit headers", async () => {
    const response = await call(
      "GET",
      "/projects/prj_abcdefghijklmnopqrstuvwx/exports/rank-history",
      undefined,
      {
        accept: "text/csv",
      },
    );
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "bisibility-rank-history-prj_abcdefghijklmnopqrstuvwx.csv",
    );
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    expect(await response.text()).toContain("keyword_id,keyword,checked_at");
  });

  it("lists one project-derived sitemap monitor with its latest snapshot", async () => {
    const response = await call("GET", "/projects/prj_abcdefghijklmnopqrstuvwx/sitemap-monitors");
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          enabled: true,
          id: "prj_abcdefghijklmnopqrstuvwx",
          latest_snapshot: { url_count: 42 },
          status: "active",
        },
      ],
      meta: { next_cursor: null },
    });
  });

  it("updates the project-derived sitemap monitor and audits the state change", async () => {
    const response = await call(
      "PATCH",
      "/projects/prj_abcdefghijklmnopqrstuvwx/sitemap-monitors/prj_abcdefghijklmnopqrstuvwx",
      {
        enabled: false,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({ enabled: false, status: "disabled" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sitemap_monitor.disable", actorId: null }),
    );
  });

  it.each([
    ["POST", "/projects/prj_abcdefghijklmnopqrstuvwx/triggered-alerts/mark-read", undefined],
    [
      "POST",
      `/projects/prj_abcdefghijklmnopqrstuvwx/triggered-alerts/${alertPublicId}/mute`,
      undefined,
    ],
    [
      "PATCH",
      "/projects/prj_abcdefghijklmnopqrstuvwx/sitemap-monitors/prj_abcdefghijklmnopqrstuvwx",
      { enabled: false },
    ],
  ])("rejects read-only scopes for %s %s", async (method, path, body) => {
    scopes = ["read"];
    const response = await call(method, path, body);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("maps export validation, sitemap scope, and monitor identity errors", async () => {
    const invalidExport = await call(
      "GET",
      "/projects/prj_abcdefghijklmnopqrstuvwx/exports/rank-history?range=365",
    );
    expect(invalidExport.status).toBe(400);

    const wrongProject = await call("GET", `/projects/${otherProjectPublicId}/sitemap-monitors`);
    expect(wrongProject.status).toBe(403);

    const wrongMonitor = await call(
      "PATCH",
      `/projects/prj_abcdefghijklmnopqrstuvwx/sitemap-monitors/${otherProjectPublicId}`,
      {
        enabled: true,
      },
    );
    expect(wrongMonitor.status).toBe(404);
  });
});
