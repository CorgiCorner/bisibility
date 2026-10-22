import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  audit: vi.fn(),
  accepted: vi.fn(),
  db: {
    providerConnection: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { ...mocks.db, $transaction: (run: (db: unknown) => unknown) => run(mocks.db) },
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decrypt,
  encryptSecret: mocks.encrypt,
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
  hasAcceptedConnectionRun: mocks.accepted,
}));
vi.mock("@/lib/metering/budget-mirror", () => ({ guardConnectionFundingMutation: vi.fn() }));
vi.mock("@/lib/api/provider-verification", () => ({
  verifyProviderConnectionBeforeSave: mocks.verify,
}));
vi.mock("@/lib/api/provider-audit", () => ({
  auditConnection: (value: unknown) => value,
  auditProviderMutation: mocks.audit,
}));

import { connectProviderConnection } from "./provider-service";

const row = {
  id: "internal",
  publicId: "conn_a00000000000000000000000",
  provider: "dataforseo",
  kind: "serp",
  priority: 2,
  credentialSource: "hosted",
  credentialsEncrypted: "retained-ciphertext",
  enabled: false,
  status: "connected",
  updatedAt: new Date("2026-10-20"),
  rates: [],
};
const input = {
  projectId: "project",
  providerId: "dataforseo" as const,
  enabled: true,
  expectedConnectionId: row.publicId,
  expectedConnectionUpdatedAt: row.updatedAt.toISOString(),
  expectedCredentialSource: "hosted" as const,
};
const context = { actorId: "actor", projectId: "project" };
const restore = () => connectProviderConnection(input, context, { restoreStoredCredentials: true });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.providerConnection.findUnique.mockResolvedValue(row);
  mocks.db.providerConnection.findMany.mockResolvedValue([row]);
  mocks.db.providerConnection.upsert.mockImplementation(async ({ update }) => ({
    ...row,
    ...update,
  }));
  mocks.decrypt.mockReturnValue({ login: "own", password: "own-secret" });
  mocks.verify.mockResolvedValue({ ok: true });
  mocks.accepted.mockResolvedValue(false);
});
it("probes the retained key using normal save validation before reactivating without replacing it", async () => {
  await expect(restore()).resolves.toMatchObject({
    credentialSource: "own",
    credentialsEncrypted: "retained-ciphertext",
    enabled: false,
  });
  expect(mocks.verify).toHaveBeenCalledWith(
    expect.objectContaining({
      credentials: { login: "own", password: "own-secret" },
      projectId: "project",
    }),
  );
  expect(mocks.encrypt).not.toHaveBeenCalled();
  expect(mocks.db.providerConnection.upsert.mock.calls[0][0].update).not.toHaveProperty(
    "credentialsEncrypted",
  );
});
it("leaves credits active and propagates the standard provider error on probe failure", async () => {
  mocks.verify.mockRejectedValue(new Error("Connection test failed: Credentials were rejected."));
  await expect(restore()).rejects.toThrow("Connection test failed: Credentials were rejected.");
  expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
});
it.each([null, "changed"])(
  "rejects a missing or concurrently replaced retained key: %s",
  async (credentialsEncrypted) => {
    mocks.db.providerConnection.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, credentialsEncrypted });
    await expect(restore()).rejects.toThrow("changed during verification");
    expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
  },
);
it("requires a retained key and the current optimistic binding before probing", async () => {
  mocks.db.providerConnection.findUnique.mockResolvedValue({ ...row, credentialsEncrypted: null });
  await expect(restore()).rejects.toThrow("changed");
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("keeps accepted hosted runs fenced", async () => {
  mocks.accepted.mockResolvedValue(true);
  await expect(restore()).rejects.toThrow("accepted checks");
  expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
});
it("does not reuse retained credentials during ordinary key entry", async () => {
  mocks.verify.mockRejectedValue(new Error("Enter provider credentials."));
  await expect(connectProviderConnection(input, context)).rejects.toThrow(
    "Enter provider credentials.",
  );
  expect(mocks.decrypt).not.toHaveBeenCalled();
  expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ credentials: {} }));
});

it("enables the retained key only when explicitly selected as an active source", async () => {
  await expect(
    connectProviderConnection(input, context, {
      restoreStoredCredentials: true,
      activateStoredCredentials: true,
    }),
  ).resolves.toMatchObject({ credentialSource: "own", enabled: true });
});
