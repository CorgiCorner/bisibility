import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearInstanceMailConfig: vi.fn(),
  consume: vi.fn(),
  findUser: vi.fn(),
  deploymentMode: vi.fn(() => "self-host" as "cloud" | "self-host"),
  getInstanceAdminSession: vi.fn(),
  readInstanceMailStatus: vi.fn(),
  saveInstanceMailConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/deployment/deployment", () => ({
  deploymentMode: mocks.deploymentMode,
}));
vi.mock("@/lib/email/instance-mail-store", () => ({
  InstanceMailSettingsError: class InstanceMailSettingsError extends Error {},
  clearInstanceMailConfig: mocks.clearInstanceMailConfig,
  readInstanceMailStatus: mocks.readInstanceMailStatus,
  saveInstanceMailConfig: mocks.saveInstanceMailConfig,
}));

import { clearInstanceMailSettings, saveInstanceMailSettings } from "./instance-mail-settings";

const form = {
  provider: "resend",
  replaceCredentials: true,
  resendApiKey: "re_test_key",
  sender: "Mail <ops@example.com>",
  sesAccessKeyId: "",
  sesRegion: "",
  sesSecretAccessKey: "",
  smtpHost: "",
  smtpPassword: "",
  smtpPort: "",
  smtpUsername: "",
};

describe("instance mail settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.findUser.mockResolvedValue({
      actorId: "user_1",
      twoFactorEnabled: true,
    });
    mocks.readInstanceMailStatus.mockResolvedValue({
      credentialsConfigured: false,
      provider: null,
      sender: "",
    });
    mocks.consume.mockResolvedValue({ success: true });
    vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", "true");
    mocks.saveInstanceMailConfig.mockResolvedValue(undefined);
    mocks.clearInstanceMailConfig.mockResolvedValue(undefined);
  });

  it("rejects cloud and an admin without two-factor authentication", async () => {
    mocks.deploymentMode.mockReturnValue("cloud");
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "forbidden" });

    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.findUser.mockResolvedValue({
      actorId: "user_1",
      twoFactorEnabled: false,
    });
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({
      status: "two_factor_required",
    });
    expect(mocks.saveInstanceMailConfig).not.toHaveBeenCalled();
  });

  it("saves without a per-action code when 2FA is enabled", async () => {
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "saved" });

    expect(mocks.saveInstanceMailConfig).toHaveBeenCalledWith({
      actorId: "user_1",
      credentials: { resendApiKey: "re_test_key" },
      provider: "resend",
      sender: "Mail <ops@example.com>",
    });
  });

  it("retains the action rate limit", async () => {
    mocks.consume.mockResolvedValue({ success: false });
    expect(await saveInstanceMailSettings(form)).toEqual({ status: "rate_limited" });
    expect(mocks.saveInstanceMailConfig).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, windowSeconds: 300 }),
    );
  });

  it("allows self-host opt-out without an enrolled factor", async () => {
    vi.stubEnv("ADMIN_REQUIRE_TWO_FACTOR", "false");
    mocks.findUser.mockResolvedValue({ twoFactorEnabled: false });
    expect(await saveInstanceMailSettings(form)).toEqual({ status: "saved" });
  });

  it("refuses clearing without enabled 2FA", async () => {
    mocks.findUser.mockResolvedValue({ twoFactorEnabled: false });
    expect(await clearInstanceMailSettings()).toEqual({ status: "two_factor_required" });
    expect(mocks.clearInstanceMailConfig).not.toHaveBeenCalled();
  });

  it("clears stored settings without a code", async () => {
    await expect(clearInstanceMailSettings()).resolves.toEqual({
      status: "cleared",
    });
    expect(mocks.clearInstanceMailConfig).toHaveBeenCalledWith("user_1");
  });
});
