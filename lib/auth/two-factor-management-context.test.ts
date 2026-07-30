import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: { findFirst: vi.fn() },
  session: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: mocks.account,
    session: mocks.session,
    user: mocks.user,
  },
}));

import { getTwoFactorSecurityContext } from "./two-factor-management-context";

describe("two-factor security context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
      twoFactorEnabled: true,
    });
    mocks.session.findFirst.mockResolvedValue({
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.account.findFirst.mockResolvedValue({ password: "stored-password-hash" });
  });

  it("authorizes against the current server-side session owned by the same user", async () => {
    await expect(
      getTwoFactorSecurityContext({
        session: { id: "session_1" },
        user: { id: "user_1" },
      } as never),
    ).resolves.toMatchObject({
      actorId: "user_1",
      actorPublicId: "usr_abcdefghijklmnopqrstuvwx",
      credentialPasswordHash: "stored-password-hash",
      sessionId: "session_1",
      twoFactorEnabled: true,
    });

    expect(mocks.session.findFirst).toHaveBeenCalledWith({
      select: { createdAt: true, expiresAt: true },
      where: { id: "session_1", userId: "user_1" },
    });
  });

  it("rejects a session missing from the authoritative store", async () => {
    mocks.session.findFirst.mockResolvedValue(null);

    await expect(
      getTwoFactorSecurityContext({
        session: { id: "revoked_session" },
        user: { id: "user_1" },
      } as never),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
