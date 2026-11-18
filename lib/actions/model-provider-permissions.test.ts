import type { connectProviderActionSchema } from "@/lib/api/provider-service";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectProvider, disconnectProvider, testConnection } from "./providers";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  test: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/provider-service", async (original) => ({
  ...(await original<typeof import("@/lib/api/provider-service")>()),
  connectProviderConnection: mocks.connect,
  disconnectProviderConnection: mocks.disconnect,
}));
vi.mock("@/lib/api/provider-test-service", () => ({ testProviderConnection: mocks.test }));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "fixture-reader" }),
  parseActionInput: (schema: typeof connectProviderActionSchema, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
  revalidateProviderViews: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockRejectedValue(new Error("Forbidden"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
for (const action of [connectProvider, testConnection, disconnectProvider]) {
  it.each(NATIVE_MODEL_PROVIDERS)(
    `${action.name} requires manage permission for %s`,
    async (providerId) => {
      const projectId = "prj_a00000000000000000000000";
      await expect(action({ projectId, providerId, secret: "fixture-key" })).rejects.toThrow(
        "Forbidden",
      );
      expect(mocks.scope).toHaveBeenCalledWith({ id: "fixture-reader" }, "manage", projectId, {
        type: "provider_connection",
      });
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(mocks.test).not.toHaveBeenCalled();
    },
  );
}
