import { TwoFactorManagementError } from "@/lib/auth/two-factor-management-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearInstanceMailConfig: vi.fn(),
  confirmEnabledTwoFactorCode: vi.fn(),
  deploymentMode: vi.fn(() => "self-host" as "cloud" | "self-host"),
  getInstanceAdminSession: vi.fn(),
  getTwoFactorSecurityContext: vi.fn(),
  readInstanceMailStatus: vi.fn(),
  saveInstanceMailConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/auth/two-factor-management-context", () => ({
  getTwoFactorSecurityContext: mocks.getTwoFactorSecurityContext,
}));
vi.mock("@/lib/auth/two-factor-step-up", () => ({
  confirmEnabledTwoFactorCode: mocks.confirmEnabledTwoFactorCode,
}));
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
  code: "123456",
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
    mocks.getTwoFactorSecurityContext.mockResolvedValue({
      actorId: "user_1",
      twoFactorEnabled: true,
    });
    mocks.readInstanceMailStatus.mockResolvedValue({
      credentialsConfigured: false,
      provider: null,
      sender: "",
    });
    mocks.confirmEnabledTwoFactorCode.mockResolvedValue("grant_1");
    mocks.saveInstanceMailConfig.mockResolvedValue(undefined);
    mocks.clearInstanceMailConfig.mockResolvedValue(undefined);
  });

  it("rejects cloud and an admin without two-factor authentication", async () => {
    mocks.deploymentMode.mockReturnValue("cloud");
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "forbidden" });

    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.getTwoFactorSecurityContext.mockResolvedValue({
      actorId: "user_1",
      twoFactorEnabled: false,
    });
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "forbidden" });
    expect(mocks.confirmEnabledTwoFactorCode).not.toHaveBeenCalled();
    expect(mocks.saveInstanceMailConfig).not.toHaveBeenCalled();
  });

  it("saves only after the authenticator code is confirmed", async () => {
    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "saved" });

    expect(mocks.confirmEnabledTwoFactorCode).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user_1" }),
      "123456",
    );
    expect(mocks.saveInstanceMailConfig).toHaveBeenCalledWith({
      actorId: "user_1",
      credentials: { resendApiKey: "re_test_key" },
      provider: "resend",
      sender: "Mail <ops@example.com>",
    });
  });

  it("does not write when the authenticator code is rejected", async () => {
    mocks.confirmEnabledTwoFactorCode.mockRejectedValue(
      new TwoFactorManagementError("step_up_failed", "Verification failed."),
    );

    await expect(saveInstanceMailSettings(form)).resolves.toEqual({ status: "step_up_failed" });
    expect(mocks.saveInstanceMailConfig).not.toHaveBeenCalled();
  });

  it("clears stored settings after the same confirmation", async () => {
    await expect(clearInstanceMailSettings({ code: "123456" })).resolves.toEqual({
      status: "cleared",
    });
    expect(mocks.clearInstanceMailConfig).toHaveBeenCalledWith("user_1");
  });
});
