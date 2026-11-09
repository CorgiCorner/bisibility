import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiAuthError } from "./auth";
import { resetIdempotencyForTests } from "./idempotency";
import { handleApiRequest, handleMcpPreauthenticatedApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  receipt: vi.fn(),
  authenticate: vi.fn(),
  dispatch: vi.fn(),
  account: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("./result-receipt", () => ({ recordApiResultReceipt: mocks.receipt }));
vi.mock("@/lib/activity/record-extension", () => ({ recordUserActivity: mocks.activity }));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("./routes", () => ({ dispatchRoute: mocks.dispatch }));
vi.mock("./account-routes", async (original) => ({
  ...(await original<typeof import("./account-routes")>()),
  dispatchAccountRoute: mocks.account,
}));
vi.mock("./personal-scope", () => ({ resolvePersonalProjectScope: mocks.resolve }));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: async () => null,
  resetRedisClientForTests: vi.fn(),
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
}));
vi.mock("./admission-error-details", () => ({ apiAdmissionErrorDetails: async () => undefined }));

const auth = {
  kind: "personal_token" as const,
  memberships: [],
  token: {
    id: "activity-token",
    name: "Fixture",
    prefix: "bsb_pat_live_",
    publicId: null,
    scopes: ["read", "write", "admin"] as const,
    userId: "activity-user",
  },
  user: { id: "activity-user", email: "activity@example.invalid", name: "Fixture", publicId: null },
};
const project = { id: "project", publicId: "prj_1", writeMode: "active" };
function request(path = "signals", method = "POST", key?: string) {
  return new Request(`https://example.test/api/v1/${path}`, {
    method,
    headers: {
      authorization: "Bearer bsb_pat_live_fixture",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
  });
}
function acted() {
  return mocks.activity.mock.calls.filter(([input]) => input.kind === "acted");
}

describe("API activity authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetIdempotencyForTests();
    mocks.authenticate.mockResolvedValue(auth);
    mocks.resolve.mockResolvedValue({ auth: { apiKey: auth.token, project }, role: "owner" });
    mocks.dispatch.mockResolvedValue(new Response(null, { status: 201 }));
    mocks.account.mockResolvedValue(new Response(null, { status: 201 }));
  });
  it("does not record activity for failed authentication", async () => {
    mocks.authenticate.mockRejectedValue(new ApiAuthError());
    expect((await handleApiRequest(request(), ["signals"])).status).toBe(401);
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("attributes a delivered project-key result to its account owner without an interactive return", async () => {
    mocks.authenticate.mockResolvedValue({
      kind: "project_key",
      apiKey: { ...auth.token, projectId: "project" },
      project: { ...project, ownerId: "owner" },
    });
    const response = await handleApiRequest(request("projects/prj_1/overview", "GET"), [
      "projects",
      "prj_1",
      "overview",
    ]);
    expect(response.ok).toBe(true);
    expect(mocks.receipt).toHaveBeenCalledWith(response, "owner", false);
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("does not record acted for a denied token scope", async () => {
    mocks.resolve.mockResolvedValue({
      auth: { apiKey: { ...auth.token, scopes: ["read"] }, project },
      role: "owner",
    });
    expect((await handleApiRequest(request(), ["signals"])).status).toBe(403);
    expect(acted()).toHaveLength(0);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("does not record acted for a denied project role", async () => {
    mocks.resolve.mockResolvedValue({ auth: { apiKey: auth.token, project }, role: "viewer" });
    expect(
      (
        await handleApiRequest(request("projects/prj_1/providers/source/connect"), [
          "projects",
          "prj_1",
          "providers",
          "source",
          "connect",
        ])
      ).status,
    ).toBe(403);
    expect(acted()).toHaveLength(0);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("does not record acted for a denied account scope", async () => {
    mocks.authenticate.mockResolvedValue({ ...auth, token: { ...auth.token, scopes: ["read"] } });
    expect((await handleApiRequest(request("projects"), ["projects"])).status).toBe(403);
    expect(acted()).toHaveLength(0);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("does not record acted for a read-only project", async () => {
    mocks.resolve.mockResolvedValue({
      auth: { apiKey: auth.token, project: { ...project, writeMode: "migration_hold" } },
      role: "owner",
    });
    expect((await handleApiRequest(request(), ["signals"])).status).toBe(423);
    expect(acted()).toHaveLength(0);
  });
  it.each([400, 403, 404, 500])(
    "does not record acted for a failed dispatch (%s)",
    async (status) => {
      mocks.dispatch.mockResolvedValue(new Response(null, { status }));
      expect((await handleApiRequest(request(), ["signals"])).status).toBe(status);
      expect(acted()).toHaveLength(0);
    },
  );
  it("does not record acted when dispatch throws", async () => {
    mocks.dispatch.mockRejectedValue(new Error("fixture failure"));
    expect((await handleApiRequest(request(), ["signals"])).status).toBe(500);
    expect(acted()).toHaveLength(0);
  });
  it.each(["signals", "projects"])(
    "records one successful mutation inside idempotency for %s",
    async (path) => {
      const dispatch = path === "projects" ? mocks.account : mocks.dispatch;
      dispatch.mockImplementation(async () => {
        expect(acted()).toHaveLength(0);
        return new Response(null, { status: 201 });
      });
      expect((await handleApiRequest(request(path, "POST", path), [path])).status).toBe(201);
      expect((await handleApiRequest(request(path, "POST", path), [path])).status).toBe(201);
      expect(acted()).toHaveLength(1);
      expect(dispatch).toHaveBeenCalledOnce();
    },
  );
  it("does not record acted for a failed account dispatch", async () => {
    mocks.account.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await handleApiRequest(request("projects"), ["projects"])).status).toBe(403);
    expect(acted()).toHaveLength(0);
  });
  it("does not record acted for reads or unknown routes", async () => {
    await handleApiRequest(request("signals", "GET"), ["signals"]);
    expect((await handleApiRequest(request("unknown"), ["unknown"])).status).toBe(404);
    expect(acted()).toHaveLength(0);
  });
  it("leaves MCP activity to the tool boundary", async () => {
    expect(
      (await handleMcpPreauthenticatedApiRequest(request(), ["signals"], { auth })).status,
    ).toBe(201);
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});
