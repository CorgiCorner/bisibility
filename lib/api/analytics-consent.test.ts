import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAnalyticsConsent: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ success: true, headers: new Headers() }),
}));

import { getOpenApiDocument } from "./openapi";
import { handleApiRequest } from "./router";

const personal = {
  kind: "personal_token",
  memberships: [],
  user: {
    id: "internal",
    publicId: "usr_a00000000000000000000000",
    name: "Example",
    email: "user@example.com",
  },
  token: { id: "token", scopes: ["read", "write", "admin"], userId: "internal" },
};
const path = ["me", "analytics-consent"];
function request(method = "GET", body?: unknown) {
  return new Request("https://example.com/api/v1/me/analytics-consent", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Bisibility-Client": "bisibility-ios/1.2.3 (42)",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("account analytics consent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(personal);
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockImplementation(async ({ create }) => create);
    mocks.transaction.mockImplementation((work) =>
      work({
        userAnalyticsConsent: { findUnique: mocks.findUnique, upsert: mocks.upsert },
        $executeRaw: async () => 0,
        user: { findUniqueOrThrow: async () => ({ publicId: personal.user.publicId }) },
      }),
    );
  });
  it("returns a private pending default without requiring a project", async () => {
    const response = await handleApiRequest(request(), path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      analytics: false,
      decided_at: null,
      source: null,
      version: 2,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("writes explicit iOS consent once and retains the decision on a retry", async () => {
    const response = await handleApiRequest(request("PUT", { analytics: true }), path);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ analytics: true, source: "ios", version: 2 });
    const row = mocks.upsert.mock.calls[0][0].create;
    mocks.findUnique.mockResolvedValue(row);
    const again = await handleApiRequest(request("PUT", { analytics: true }), path);
    expect((await again.json()).decided_at).toBe(row.decidedAt.toISOString());
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
  it.each([
    { analytics: "yes" },
    { analytics: true, replay: true },
    { analytics: true, email: "user@example.com" },
  ])("rejects invalid and additional fields before changing the account", async (body) => {
    const response = await handleApiRequest(request("PUT", body), path);
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects project credentials and read-only personal writes", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      kind: "project_key",
      apiKey: { id: "key", scopes: ["admin"] },
      project: {},
    });
    expect((await handleApiRequest(request(), path)).status).toBe(404);
    mocks.authenticate.mockResolvedValueOnce({
      ...personal,
      token: { ...personal.token, scopes: ["read"] },
    });
    expect((await handleApiRequest(request("PUT", { analytics: false }), path)).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("refuses consent changes by third-party OAuth grants", async () => {
    mocks.authenticate.mockResolvedValue({ ...personal, oauthClientId: "external-client" });
    const response = await handleApiRequest(request("PUT", { analytics: true }), path);
    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("documents the exact methods, request fields and personal authentication", () => {
    const entry = getOpenApiDocument().paths["/me/analytics-consent"];
    expect(Object.keys(entry).sort()).toEqual(["get", "put"]);
    expect(entry.put.security).toEqual([{ PersonalAccessToken: [] }]);
    expect(entry.put.requestBody.content["application/json"].schema).toMatchObject({
      additionalProperties: false,
      required: ["analytics"],
    });
  });
});
