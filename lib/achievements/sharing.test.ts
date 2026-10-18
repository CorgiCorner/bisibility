import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    achievementAward: mock,
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ publicId: "usr_a" }) },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./config", () => ({ achievementsEnabled: () => true }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: "disabled" }) }));

import { readPublicAchievement, setAchievementSharing } from "./sharing";

describe("explicit achievement sharing", () => {
  beforeEach(() => vi.clearAllMocks());
  it("writes a hash for the authenticated owner, returns an opaque token and revokes it", async () => {
    mock.updateMany.mockResolvedValue({ count: 1 });
    const result = await setAchievementSharing("owner-a", { kind: "presence", published: true });
    expect(result.kind).toBe("saved");
    if (result.kind !== "saved") throw new Error();
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const query = mock.updateMany.mock.calls[0][0];
    expect(query.where.userId).toBe("owner-a");
    expect(query.data.shareTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(query.data.shareTokenHash).not.toContain(result.token);
    await setAchievementSharing("owner-a", { kind: "presence", published: false });
    expect(mock.updateMany.mock.calls[1][0].data.shareTokenHash).toBeNull();
  });
  it("cannot publish an unearned award or resolve malformed or revoked links", async () => {
    mock.updateMany.mockResolvedValue({ count: 0 });
    expect(await setAchievementSharing("other", { kind: "practice", published: true })).toEqual({
      kind: "not_earned",
    });
    expect(await readPublicAchievement("usr_not-a-token")).toBeNull();
    expect(mock.findUnique).not.toHaveBeenCalled();
    mock.findUnique.mockResolvedValue(null);
    expect(await readPublicAchievement("a".repeat(43))).toBeNull();
  });
  it("public projections omit names, emails and project context and reject deactivated owners", async () => {
    mock.findUnique.mockResolvedValue({
      kind: "presence",
      earnedDay: "2026-10-16",
      user: { deactivatedAt: null },
    });
    expect(await readPublicAchievement("a".repeat(43))).toEqual({
      kind: "presence",
      earnedDay: "2026-10-16",
    });
    mock.findUnique.mockResolvedValue({
      kind: "presence",
      earnedDay: "2026-10-16",
      user: { deactivatedAt: new Date() },
    });
    expect(await readPublicAchievement("a".repeat(43))).toBeNull();
  });
});
