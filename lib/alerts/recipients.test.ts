import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterAlertEmailRecipients, resolveAlertRuleRecipients } from "./recipients";

const mocks = vi.hoisted(() => ({
  prisma: {
    membership: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("alert recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([]);
    mocks.prisma.membership.findMany.mockResolvedValue([
      { userId: "user_1" },
      { userId: "user_2" },
    ]);
  });

  it("prefers configured recipients and falls back to the creator", () => {
    expect(
      resolveAlertRuleRecipients({
        createdBy: { email: "owner@example.com", id: "user_1" },
        recipients: [{ user: { email: "second@example.com", id: "user_2" } }],
      }),
    ).toEqual([{ email: "second@example.com", userId: "user_2" }]);
    expect(
      resolveAlertRuleRecipients({
        createdBy: { email: "owner@example.com", id: "user_1" },
        recipients: [],
      }),
    ).toEqual([{ email: "owner@example.com", userId: "user_1" }]);
    expect(resolveAlertRuleRecipients({ createdBy: null, recipients: [] })).toEqual([]);
  });

  it("defaults missing preference rows to enabled and filters disabled users", async () => {
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([
      { alertEmail: false, userId: "user_2" },
    ]);
    const recipients = [
      { email: "owner@example.com", userId: "user_1" },
      { email: "second@example.com", userId: "user_2" },
    ];

    await expect(filterAlertEmailRecipients("project_1", recipients)).resolves.toEqual([
      recipients[0],
    ]);
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledWith({
      select: { alertEmail: true, userId: true },
      where: { projectId: "project_1", userId: { in: ["user_1", "user_2"] } },
    });
  });
  it("drops recipients who no longer hold a membership in the project", async () => {
    mocks.prisma.membership.findMany.mockResolvedValue([{ userId: "user_1" }]);
    const recipients = [
      { email: "owner@example.com", userId: "user_1" },
      { email: "removed@example.com", userId: "user_2" },
    ];

    await expect(filterAlertEmailRecipients("project_1", recipients)).resolves.toEqual([
      recipients[0],
    ]);
    expect(mocks.prisma.membership.findMany).toHaveBeenCalledWith({
      select: { userId: true },
      where: { projectId: "project_1", userId: { in: ["user_1", "user_2"] } },
    });
  });
});
