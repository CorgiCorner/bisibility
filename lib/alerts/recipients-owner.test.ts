import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyMemberships: vi.fn(),
  findManyPreferences: vi.fn(),
  findUniqueProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    membership: { findMany: mocks.findManyMemberships },
    notificationPreference: { findMany: mocks.findManyPreferences },
    project: { findUnique: mocks.findUniqueProject },
  },
}));

import { filterAlertEmailRecipients } from "./recipients";

const owner = { email: "owner@example.com", userId: "owner_1" };
const stranger = { email: "gone@example.com", userId: "gone_1" };

/**
 * authorize() accepts a project's ownerId without a membership row, and recipient validation
 * admits the owner the same way; delivery must not silently drop that owner.
 */
describe("filterAlertEmailRecipients owner without a membership row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findManyMemberships.mockResolvedValue([]);
    mocks.findManyPreferences.mockResolvedValue([]);
  });

  it("keeps the project owner even when no membership row exists", async () => {
    mocks.findUniqueProject.mockResolvedValue({ ownerId: owner.userId });

    await expect(filterAlertEmailRecipients("project_1", [owner, stranger])).resolves.toEqual([
      owner,
    ]);

    expect(mocks.findUniqueProject).toHaveBeenCalledExactlyOnceWith({
      select: { ownerId: true },
      where: { id: "project_1" },
    });
  });

  it("still honours the owner's own email opt-out", async () => {
    mocks.findUniqueProject.mockResolvedValue({ ownerId: owner.userId });
    mocks.findManyPreferences.mockResolvedValue([{ alertEmail: false, userId: owner.userId }]);

    await expect(filterAlertEmailRecipients("project_1", [owner])).resolves.toEqual([]);
  });

  it("drops everyone when the project row is gone", async () => {
    mocks.findUniqueProject.mockResolvedValue(null);

    await expect(filterAlertEmailRecipients("project_1", [owner, stranger])).resolves.toEqual([]);
  });
});
