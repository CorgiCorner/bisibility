import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initial: vi.fn(),
  verify: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/domain-rating/collect", () => ({ collectInitialDomainRating: mocks.initial }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    providerConnection: { findUnique: async () => null, upsert: mocks.upsert },
  },
}));
vi.mock("@/lib/providers/registry", () => ({
  PROVIDER_CATALOG: [{ id: "ahrefs", kind: "enrichment" }],
}));
vi.mock("@/lib/api/provider-verification", () => ({
  verifyProviderConnectionBeforeSave: mocks.verify,
}));
vi.mock("@/lib/api/provider-credential-defaults", () => ({
  withProviderCredentialDefaults: async () => ({ apiKey: "fixture" }),
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({}),
  encryptSecret: () => "encrypted",
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
  hasAcceptedConnectionRun: vi.fn(),
}));
vi.mock("@/lib/provider-allocations/initialize", () => ({ initializeConnectionBudgets: vi.fn() }));
vi.mock("@/lib/api/provider-chain-writer", () => ({
  connectedProviderChainSettings: async (
    _project: string,
    _kind: string,
    _before: unknown,
    input: { enabled: boolean },
  ) => ({ enabled: input.enabled, priority: 100 }),
  renumberProviderChain: vi.fn(),
}));
vi.mock("@/lib/api/provider-audit", () => ({
  auditConnection: (value: unknown) => value,
  auditProviderMutation: mocks.audit,
}));

import { connectProviderConnection } from "./provider-service";

const context = { actorId: "u", projectId: "internal-project" };
const input = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  providerId: "ahrefs" as const,
  enabled: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ providerConnection: { findUnique: async () => null, upsert: mocks.upsert } }),
  );
  mocks.upsert.mockImplementation(async ({ create }) => ({
    ...create,
    id: "c",
    publicId: "conn_abcdefghijklmnopqrstuvwx",
  }));
  mocks.initial.mockResolvedValue("succeeded");
});
it("collects the initial rating only after the verified connection commits", async () => {
  await connectProviderConnection(input, context);
  expect(mocks.initial).toHaveBeenCalledWith("internal-project", expect.any(Date), "u", undefined);
  expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.transaction.mock.invocationCallOrder[0],
  );
  expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.initial.mock.invocationCallOrder[0],
  );
});
it("never collects when connection verification fails", async () => {
  mocks.verify.mockRejectedValue(new Error("failed"));
  await expect(connectProviderConnection(input, context)).rejects.toThrow("failed");
  expect(mocks.initial).not.toHaveBeenCalled();
});
it("never collects when saving the connection fails", async () => {
  mocks.transaction.mockRejectedValue(new Error("failed"));
  await expect(connectProviderConnection(input, context)).rejects.toThrow("failed");
  expect(mocks.initial).not.toHaveBeenCalled();
});
it("preserves a successfully saved key when the separate measurement fails", async () => {
  mocks.initial.mockRejectedValue(new Error("database unavailable"));
  await expect(connectProviderConnection(input, context)).resolves.toMatchObject({ id: "c" });
});
it("does not dispatch from a disabled connection", async () => {
  await connectProviderConnection({ ...input, enabled: false }, context);
  expect(mocks.initial).not.toHaveBeenCalled();
});
