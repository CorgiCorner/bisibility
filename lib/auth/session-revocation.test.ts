import { beforeEach, describe, expect, it, vi } from "vitest";

const { countMock, deleteManyMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { session: { count: countMock, deleteMany: deleteManyMock } },
}));

import { countOtherSessions, revokeOtherSessions } from "./session-revocation";

describe("countOtherSessions", () => {
  it("counts every session of the user except the current one", async () => {
    countMock.mockResolvedValue(2);

    await expect(
      countOtherSessions({ session: { id: "sess_1" }, user: { id: "user_1" } }),
    ).resolves.toBe(2);

    expect(countMock).toHaveBeenCalledExactlyOnceWith({
      where: { id: { not: "sess_1" }, userId: "user_1" },
    });
  });
});

describe("revokeOtherSessions", () => {
  beforeEach(() => deleteManyMock.mockReset());

  it("deletes every session of the user except the current one", async () => {
    deleteManyMock.mockResolvedValue({ count: 3 });

    await expect(
      revokeOtherSessions({ session: { id: "sess_1" }, user: { id: "user_1" } }),
    ).resolves.toBe(3);

    expect(deleteManyMock).toHaveBeenCalledExactlyOnceWith({
      where: { id: { not: "sess_1" }, userId: "user_1" },
    });
  });
});
