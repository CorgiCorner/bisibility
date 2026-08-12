import { notFound } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstanceAdminSession, requireInstanceAdmin } from "./instance-admin";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  getSession: vi.fn(),
  getSessionReference: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  getSessionReference: mocks.getSessionReference,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("instance admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getSessionReference.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.prisma.user.findUnique.mockResolvedValue({
      deactivatedAt: null,
      isInstanceAdmin: false,
    });
  });

  it("requires the dedicated instance-admin flag", async () => {
    const session = { user: { id: "user_1" } };
    mocks.getSession.mockResolvedValue(session);
    mocks.prisma.user.findUnique.mockResolvedValue({ isInstanceAdmin: true });

    await expect(requireInstanceAdmin()).resolves.toBe(session);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      select: { isInstanceAdmin: true },
      where: { id: "user_1" },
    });
  });

  it("returns null for action authorization without invoking notFound", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(getInstanceAdminSession()).resolves.toBeNull();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each([null, { isInstanceAdmin: false }])(
    "hides the admin surface from a missing or non-admin account",
    async (user) => {
      mocks.prisma.user.findUnique.mockResolvedValue(user);

      await expect(requireInstanceAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
    },
  );
});
