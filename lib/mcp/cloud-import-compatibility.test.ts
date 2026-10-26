import { beforeEach, expect, it, vi } from "vitest";
import { dispatchMcpRestCall } from "./rest-call";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), latest: vi.fn(), authenticate: vi.fn() }));
vi.mock("@/lib/queries/migration-compatibility", () => ({ latestFinishedMigration: mocks.latest }));
vi.mock("@/lib/api/auth", async (original) => ({
  ...(await original<typeof import("@/lib/api/auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("@/lib/api/ratelimit", async (original) => ({
  ...(await original<typeof import("@/lib/api/ratelimit")>()),
  checkRateLimit: mocks.limit,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ success: true, headers: new Headers() });
  mocks.latest.mockResolvedValue(null);
});

it("serves the advertised compatibility preflight through the actual MCP router without bearer authentication", async () => {
  const result = await dispatchMcpRestCall(
    { path: "/cloud/import/compatibility", method: "GET" },
    "",
  );
  expect(result.status).toBe(200);
  expect(result.payload).toMatchObject({
    schema_versions_supported: [7, 6],
    latest_migration: null,
  });
  expect(mocks.authenticate).not.toHaveBeenCalled();
  expect(mocks.limit).toHaveBeenCalledOnce();
  expect(mocks.limit).toHaveBeenCalledWith(expect.any(Request), { kind: "anonymous" });
});

it("applies the anonymous limit before looking up compatibility metadata", async () => {
  mocks.limit.mockResolvedValue({
    success: false,
    headers: new Headers({ "Retry-After": "60" }),
    resetAt: Date.now() + 60000,
  });
  const result = await dispatchMcpRestCall(
    { path: "/cloud/import/compatibility", method: "GET" },
    "",
  );
  expect(result.status).toBe(429);
  expect(mocks.latest).not.toHaveBeenCalled();
  expect(mocks.authenticate).not.toHaveBeenCalled();
});
