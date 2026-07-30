import packageJson from "@/package.json";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  prisma: { $queryRaw: vi.fn() },
  rateLimitExceeded: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function request() {
  return new Request("https://example.test/api/cloud/import/compatibility") as NextRequest;
}

describe("GET /api/cloud/import/compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_VERSION", "");
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((limit) =>
      Response.json(
        { status: 429, title: "Rate limited" },
        { headers: limit.headers, status: 429 },
      ),
    );
    mocks.prisma.$queryRaw.mockResolvedValue([{ migration_name: "20260628234220_two_factor" }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns compatibility metadata without project data", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      app_version: packageJson.version,
      latest_migration: "20260628234220_two_factor",
      schema_versions_supported: [5],
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      kind: "anonymous",
    });
  });

  it("returns 429 when the anonymous rate limit is exceeded", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      headers: new Headers({ "Retry-After": "60" }),
      success: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.rateLimitExceeded).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns null for latest_migration when the migration query fails", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ latest_migration: null });
  });

  it("uses APP_VERSION when set", async () => {
    vi.stubEnv("APP_VERSION", "1.8.7-test");
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      app_version: "1.8.7-test",
      latest_migration: null,
    });
  });
});
