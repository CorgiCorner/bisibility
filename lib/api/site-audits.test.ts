vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  run: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.requireScope }));
vi.mock("@/lib/site-audit/service", () => ({
  runSiteAudit: mocks.run,
  listSiteAudits: mocks.list,
  readSiteAudit: mocks.read,
}));

import { AuditRateLimitError } from "@/lib/site-audit/errors";
import type { ApiContext } from "./context";
import { siteAuditsRoute } from "./site-audits";

const ctx = (method: string, path: string[], body = {}) =>
  ({
    method,
    path,
    auth: { project: { id: "internal1", publicId: "prj_one" } },
    actor: { id: "user", memberships: [{ projectId: "internal1", role: "owner" }] },
    headers: new Headers(),
    instance: "/api/v1",
    req: new Request("https://example.test/api/v1", {
      method: method === "GET" ? "GET" : "POST",
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
    url: new URL("https://example.test/api/v1"),
    origin: { kind: "api" },
  }) as unknown as ApiContext;
describe("site audit REST contract", () => {
  it("rejects another project before any service call", async () => {
    const response = await siteAuditsRoute(ctx("POST", ["projects", "prj_other", "site-audits"]));
    expect(response?.status).toBe(403);
    expect(mocks.requireScope).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("validates snake_case input, resolves write scope and returns snake_case results", async () => {
    mocks.requireScope.mockResolvedValue({ id: "internal1", domain: "example.com" });
    mocks.run.mockResolvedValue({
      id: "agr_one",
      createdAt: "2026-10-02T10:00:00Z",
      cached: false,
      result: { summary: { indexable: 1 }, pages: [{ responseTimeMs: 2 }] },
    });
    const response = await siteAuditsRoute(
      ctx("POST", ["projects", "prj_one", "site-audits"], { max_pages: 2 }),
    );
    expect(response?.status).toBe(200);
    expect(mocks.requireScope).toHaveBeenCalledWith(expect.anything(), "create", "prj_one", {
      type: "project",
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ project: { id: "internal1", domain: "example.com" } }),
      { maxPages: 2 },
    );
    expect(await response?.json()).toMatchObject({
      data: { created_at: "2026-10-02T10:00:00Z", result: { pages: [{ response_time_ms: 2 }] } },
    });
  });
  it("returns HTTP 429 with project quota and retry metadata for a denied crawl", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_010_000);
    try {
      mocks.requireScope.mockResolvedValue({ id: "internal1", domain: "example.com" });
      mocks.run.mockRejectedValueOnce(new AuditRateLimitError(1_800_000_060_000, 2, 0));
      const response = await siteAuditsRoute(
        ctx("POST", ["projects", "prj_one", "site-audits"], { max_pages: 3 }),
      );
      expect(response?.status).toBe(429);
      expect(response?.headers.get("Retry-After")).toBe("50");
      expect(response?.headers.get("RateLimit-Limit")).toBe("2");
      expect(response?.headers.get("RateLimit-Remaining")).toBe("0");
      expect(response?.headers.get("RateLimit-Reset")).toBe("50");
      expect(await response?.json()).toMatchObject({
        type: "https://bisibility.com/problems/rate_limited",
        status: 429,
        details: { reset_at: 1_800_000_060_000, retry_after_seconds: 50 },
      });
    } finally {
      now.mockRestore();
    }
  });
  it("bounds and rejects arbitrary targets", async () => {
    for (const body of [{ max_pages: 16 }, { target: "http://127.0.0.1" }])
      await expect(
        siteAuditsRoute(ctx("POST", ["projects", "prj_one", "site-audits"], body)),
      ).rejects.toThrow();
  });
  it("scopes history and report details by internal project", async () => {
    mocks.list.mockResolvedValue([]);
    mocks.read.mockResolvedValue(null);
    const history = await siteAuditsRoute(ctx("GET", ["projects", "prj_one", "site-audits"]));
    expect(history?.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("internal1");
    const report = await siteAuditsRoute(
      ctx("GET", ["projects", "prj_one", "site-audits", "agr_missing"]),
    );
    expect(report?.status).toBe(404);
    expect(mocks.read).toHaveBeenCalledWith("internal1", "agr_missing");
  });
});
