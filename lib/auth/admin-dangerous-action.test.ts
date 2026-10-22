import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: findUser } } }));

import {
  adminDangerousActionAllowed,
  requireAdminTwoFactorForDangerousAction,
} from "./admin-dangerous-action";

const session = { user: { id: "admin" } } as never;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("dangerous admin action gate", () => {
  it.each([undefined, "true", "false", "FALSE", "invalid"])(
    "Cloud always enforces 2FA with flag %s",
    async (flag) => {
      vi.stubEnv("DEPLOYMENT_MODE", "cloud");
      vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", flag);
      findUser.mockResolvedValue({ twoFactorEnabled: false });
      await expect(
        requireAdminTwoFactorForDangerousAction(session, "change_secrets"),
      ).rejects.toMatchObject({ code: "two_factor_required", action: "change_secrets" });
    },
  );
  it.each([undefined, "true", "FALSE", "invalid"])(
    "self-host defaults on with flag %s",
    async (flag) => {
      vi.stubEnv("DEPLOYMENT_MODE", "self-host");
      vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", flag);
      findUser.mockResolvedValue({ twoFactorEnabled: false });
      await expect(
        requireAdminTwoFactorForDangerousAction(session, "delete"),
      ).rejects.toMatchObject({ code: "two_factor_required" });
    },
  );
  it.each(["cloud", "self-host"])(
    "allows enabled 2FA in %s and reads the current record",
    async (mode) => {
      vi.stubEnv("DEPLOYMENT_MODE", mode);
      findUser
        .mockResolvedValueOnce({ twoFactorEnabled: true })
        .mockResolvedValueOnce({ twoFactorEnabled: false });
      await expect(
        requireAdminTwoFactorForDangerousAction(session, "save"),
      ).resolves.toBeUndefined();
      await expect(requireAdminTwoFactorForDangerousAction(session, "save")).rejects.toMatchObject({
        code: "two_factor_required",
      });
      expect(findUser).toHaveBeenCalledWith({
        where: { id: "admin" },
        select: { twoFactorEnabled: true },
      });
    },
  );
  it("allows the explicit self-host opt-out without requiring an enrolled factor", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "self-host");
    vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", "false");
    expect(await adminDangerousActionAllowed(session)).toBe(true);
    await expect(requireAdminTwoFactorForDangerousAction(session, "save")).resolves.toBeUndefined();
    expect(findUser).not.toHaveBeenCalled();
  });
  it("fails closed when the acting user no longer exists", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    findUser.mockResolvedValue(null);
    expect(await adminDangerousActionAllowed(session)).toBe(false);
  });
});
