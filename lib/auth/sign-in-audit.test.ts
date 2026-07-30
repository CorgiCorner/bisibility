import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeAudit, findUnique } = vi.hoisted(() => ({
  writeAudit: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("./audit", () => ({ writeAudit }));

import { recordSignInAudit } from "./sign-in-audit";

beforeEach(() => {
  writeAudit.mockReset();
  findUnique.mockReset();
});

describe("recordSignInAudit", () => {
  it("attributes a failed sign-in to each project the account belongs to", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      memberships: [{ projectId: "p1" }],
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });

    await recordSignInAudit({
      email: "demo@example.com",
      status: "failed",
      statusReason: "invalid_or_expired_code",
    });

    expect(findUnique).toHaveBeenCalledWith({
      select: {
        id: true,
        memberships: { select: { projectId: true } },
        publicId: true,
      },
      where: { email: "demo@example.com" },
    });
    expect(writeAudit).toHaveBeenCalledTimes(1);
    // Failed attempt: attributed to the account via targetId, but actorId stays
    // null - a failed login was not performed by the victim.
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.sign_in",
        actorId: null,
        projectId: "p1",
        status: "failed",
        statusReason: "invalid_or_expired_code",
        targetId: "usr_abcdefghijklmnopqrstuvwx",
        targetType: "user",
      }),
    );
  });

  it("records an unknown-email failure as a global event, no lookup, no project or actor", async () => {
    await recordSignInAudit({
      email: "unknown",
      status: "failed",
      statusReason: "invalid_or_expired_code",
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledTimes(1);
    const arg = writeAudit.mock.calls[0][0];
    expect(arg.actorId).toBeNull();
    expect(arg.projectId).toBeUndefined();
    expect(arg.status).toBe("failed");
    expect(arg.targetId).toBe("unknown-account");
    expect(arg.targetType).toBe("authentication");
  });

  it("records a successful sign-in for every project membership", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      memberships: [{ projectId: "p1" }, { projectId: "p2" }],
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });

    await recordSignInAudit({ email: "demo@example.com", status: "success", userId: "u1" });

    expect(findUnique).toHaveBeenCalledWith({
      select: {
        id: true,
        memberships: { select: { projectId: true } },
        publicId: true,
      },
      where: { id: "u1" },
    });
    expect(writeAudit).toHaveBeenCalledTimes(2);
    const projectIds = writeAudit.mock.calls.map((c) => c[0].projectId).sort();
    expect(projectIds).toEqual(["p1", "p2"]);
    expect(
      writeAudit.mock.calls.every((c) => c[0].status === "success" && c[0].actorId === "u1"),
    ).toBe(true);
  });
});
