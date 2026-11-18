import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  test: vi.fn(),
}));
vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticate,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./provider-service", async (original) => ({
  ...(await original<typeof import("./provider-service")>()),
  connectProviderConnection: mocks.connect,
  disconnectProviderConnection: mocks.disconnect,
}));
vi.mock("./provider-test-service", () => ({ testProviderConnection: mocks.test }));

const projectId = "prj_a00000000000000000000000";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    kind: "project_key",
    creatorRole: "owner",
    apiKey: { id: "fixture-key", projectId: "fixture-project", scopes: ["read"] },
    project: { id: "fixture-project", publicId: projectId },
  });
});
for (const [method, suffix] of [
  ["POST", "/connect"],
  ["POST", "/test"],
  ["DELETE", ""],
] as const) {
  it.each(NATIVE_MODEL_PROVIDERS)(`read-only API key cannot ${method} %s${suffix}`, async (id) => {
    const path = ["projects", projectId, "providers", id, ...(suffix ? [suffix.slice(1)] : [])];
    const response = await handleApiRequest(
      new Request(`https://example.com/api/v1/${path.join("/")}`, {
        method,
        headers: { authorization: "Bearer fixture-token", "content-type": "application/json" },
        ...(method === "POST"
          ? { body: JSON.stringify({ credentials: { api_key: "fixture-key" } }) }
          : {}),
      }),
      path,
    );
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.test).not.toHaveBeenCalled();
  });
}
