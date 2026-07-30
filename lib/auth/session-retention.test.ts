import { beforeEach, describe, expect, it, vi } from "vitest";
import { purgeExpiredSessions } from "./session-retention";

const mocks = vi.hoisted(() => ({
  prisma: {
    session: { deleteMany: vi.fn() },
    verification: { deleteMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

describe("purgeExpiredSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 4 });
    mocks.prisma.verification.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("deletes sessions and verifications past their expiresAt", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const summary = await purgeExpiredSessions({ now });

    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(mocks.prisma.verification.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(summary).toEqual({
      cutoff: now,
      sessionsDeleted: 4,
      verificationsDeleted: 2,
    });
  });

  it("skips verifications when includeVerifications is false", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const summary = await purgeExpiredSessions({ now, includeVerifications: false });

    expect(mocks.prisma.verification.deleteMany).not.toHaveBeenCalled();
    expect(summary).toEqual({
      cutoff: now,
      sessionsDeleted: 4,
      verificationsDeleted: 0,
    });
  });
});
