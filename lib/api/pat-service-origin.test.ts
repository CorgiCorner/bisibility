import { beforeEach, describe, expect, it, vi } from "vitest";
import { issuePersonalToken, revokePersonalToken } from "./pat-service";

const mocks = vi.hoisted(() => ({ create: vi.fn(), audit: vi.fn(), guard: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/demo/identity", () => ({ assertEditableDemoAccountMutable: mocks.guard }));
vi.mock("@/lib/providers/crypto", () => ({ hashApiKey: () => "test-hash" }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { personalAccessToken: { create: mocks.create } } }));
const token = {
  id: "internal",
  publicId: "pat_abcdefghijklmnopqrstuvwx",
  name: "Tool",
  scopes: ["read"],
  expiresAt: null,
  revokedAt: null,
  prefix: "test-prefix",
};
describe("personal token app provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(token);
  });
  it("persists explicit OAuth client provenance on issuance, without a raw token", async () => {
    const issued = await issuePersonalToken(
      "viewer",
      { name: "Tool", scope: "read", expiresInDays: null },
      { action: "pat.exchange_login", viaClientId: "exact-client" },
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pat.exchange_login",
        actorId: "viewer",
        targetId: token.publicId,
        after: expect.objectContaining({ viaClientId: "exact-client" }),
      }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(issued.raw);
  });
  it("reuses the revocation service with an optional transaction client", async () => {
    const findFirst = vi.fn().mockResolvedValue(token);
    const update = vi.fn().mockResolvedValue({ ...token, revokedAt: new Date() });
    const client = { personalAccessToken: { findFirst, update }, auditLog: {} };
    await revokePersonalToken("viewer", token.publicId, client as never);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "viewer", publicId: token.publicId } }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pat.revoke" }),
      client,
    );
  });
});
