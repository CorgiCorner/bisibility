import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeUserConnectedApp } from "./connected-apps";

const mocks = vi.hoisted(() => ({
  consent: vi.fn(),
  refresh: vi.fn(),
  access: vi.fn(),
  audit: vi.fn(),
  guard: vi.fn(),
  tokens: vi.fn(),
  revoke: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/demo/identity", () => ({ assertEditableDemoAccountMutable: mocks.guard }));
vi.mock("./connected-app-tokens", () => ({ getAppCreatedTokens: mocks.tokens }));
vi.mock("./pat-service", () => ({ revokePersonalToken: mocks.revoke }));
const tx = {
  oauthConsent: { deleteMany: mocks.consent },
  oauthRefreshToken: { updateMany: mocks.refresh },
  oauthAccessToken: { deleteMany: mocks.access },
};
describe("connected app revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation((run) => run(tx));
    for (const fn of [mocks.consent, mocks.refresh, mocks.access])
      fn.mockResolvedValue({ count: 1 });
    mocks.tokens.mockResolvedValue([{ id: "pat_linked", name: "Tool" }]);
    mocks.revoke.mockResolvedValue({ revokedAt: new Date() });
  });
  it.each(["dynamic-client", "bisibility-cli", "bisibility-ios"])(
    "revokes only the viewer's rows for %s",
    async (clientId) => {
      await revokeUserConnectedApp("viewer", clientId, { revokeCreatedTokens: false });
      expect(mocks.consent).toHaveBeenCalledWith({ where: { userId: "viewer", clientId } });
      expect(mocks.access).toHaveBeenCalledWith({ where: { userId: "viewer", clientId } });
      expect(mocks.refresh).toHaveBeenCalledWith({
        where: { userId: "viewer", clientId, revoked: null },
        data: { revoked: expect.any(Date) },
      });
      expect(mocks.tokens).not.toHaveBeenCalled();
      expect(mocks.revoke).not.toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "account.connected_app_revoked",
          actorId: "viewer",
          targetId: clientId,
          after: {
            clientId,
            deletedConsentCount: 1,
            revokedRefreshTokenCount: 1,
            deletedAccessTokenCount: 1,
            revokedCreatedTokenCount: 0,
          },
        }),
        tx,
      );
    },
  );
  it("optionally revokes proven PATs through the existing service in the transaction", async () => {
    await expect(
      revokeUserConnectedApp("viewer", "app", { revokeCreatedTokens: true }),
    ).resolves.toEqual({ revoked: true, revokedCreatedTokenCount: 1 });
    expect(mocks.tokens).toHaveBeenCalledWith("viewer", "app", tx);
    expect(mocks.revoke).toHaveBeenCalledWith("viewer", "pat_linked", tx);
  });
  it("is idempotent when rows have already been revoked", async () => {
    for (const fn of [mocks.consent, mocks.refresh, mocks.access])
      fn.mockResolvedValue({ count: 0 });
    mocks.tokens.mockResolvedValue([]);
    for (let n = 0; n < 2; n++)
      await expect(
        revokeUserConnectedApp("viewer", "app", { revokeCreatedTokens: true }),
      ).resolves.toMatchObject({ revoked: true, revokedCreatedTokenCount: 0 });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("enforces the demo mutation guard before any writes", async () => {
    mocks.guard.mockRejectedValue(new Error("locked"));
    await expect(
      revokeUserConnectedApp("viewer", "app", { revokeCreatedTokens: true }),
    ).rejects.toThrow("locked");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
