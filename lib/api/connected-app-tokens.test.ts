import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppCreatedTokens } from "./connected-app-tokens";

const mocks = vi.hoisted(() => ({ receipts: vi.fn(), tokens: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.receipts },
    personalAccessToken: { findMany: mocks.tokens },
  },
}));
describe("app-created personal tokens", () => {
  beforeEach(() => vi.clearAllMocks());
  it("never guesses missing historical origin from a token name", async () => {
    mocks.receipts.mockResolvedValue([]);
    await expect(getAppCreatedTokens("viewer", "app")).resolves.toEqual([]);
    expect(mocks.tokens).not.toHaveBeenCalled();
  });
  it("matches only successful receipts for this actor/client and owned active PATs", async () => {
    mocks.receipts.mockResolvedValue([{ targetId: "pat_exact" }]);
    mocks.tokens.mockResolvedValue([{ publicId: "pat_exact", name: "Tool" }]);
    await expect(getAppCreatedTokens("viewer", "app")).resolves.toEqual([
      { id: "pat_exact", name: "Tool" },
    ]);
    expect(mocks.receipts).toHaveBeenCalledWith({
      where: {
        actorId: "viewer",
        action: "pat.exchange_login",
        status: "success",
        targetType: "personal_access_token",
        after: { path: ["viaClientId"], equals: "app" },
      },
      select: { targetId: true },
    });
    expect(mocks.tokens.mock.calls[0][0].where).toEqual({
      userId: "viewer",
      publicId: { in: ["pat_exact"] },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });
});
