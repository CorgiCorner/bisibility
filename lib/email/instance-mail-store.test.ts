import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteConfig: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  userFind: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (run: (client: unknown) => Promise<unknown>) =>
      run({
        instanceMailConfig: {
          delete: mocks.deleteConfig,
          update: mocks.update,
          upsert: mocks.upsert,
        },
      }),
    instanceMailConfig: { findUnique: mocks.findUnique },
    user: { findUnique: mocks.userFind },
  },
}));

import { getInstanceMailRuntime, setInstanceMailRuntime } from "./instance-mail-runtime";
import {
  clearInstanceMailConfig,
  refreshInstanceMailRuntime,
  saveInstanceMailConfig,
} from "./instance-mail-store";
import { isEmailConfigured } from "./registry";

describe("instance mail store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInstanceMailRuntime(null);
    vi.stubEnv("DEPLOYMENT_MODE", "self-host");
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("RESEND_API_KEY", "");
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.upsert.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.deleteConfig.mockResolvedValue({});
  });

  afterEach(() => {
    setInstanceMailRuntime(null);
    vi.unstubAllEnvs();
  });

  it("ignores a stored row on cloud", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    mocks.findUnique.mockResolvedValue({
      credentialsCipher: "cipher",
      provider: "resend",
      sender: "Mail <ops@example.com>",
    });

    await refreshInstanceMailRuntime();

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(getInstanceMailRuntime()).toBeNull();
  });

  it("decrypts a stored key into runtime memory and keeps it out of the audit", async () => {
    const cipher = encryptSecret(JSON.stringify({ resendApiKey: "re_test_key" }));
    mocks.findUnique.mockResolvedValue({
      credentialsCipher: cipher,
      provider: "resend",
      sender: "Mail <ops@example.com>",
    });

    await refreshInstanceMailRuntime();

    expect(cipher).not.toContain("re_test_key");
    expect(getInstanceMailRuntime()?.resendApiKey).toBe("re_test_key");
    expect(isEmailConfigured()).toBe(true);
  });

  it("encrypts a replacement key and audits only the provider and change flags", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await saveInstanceMailConfig({
      actorId: "user_1",
      credentials: { resendApiKey: "re_test_key" },
      provider: "resend",
      sender: "Mail <ops@example.com>",
    });

    const saved = mocks.upsert.mock.calls[0]?.[0].create.credentialsCipher as string;
    expect(saved).not.toContain("re_test_key");
    expect(saved).not.toContain("ops@example.com");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.mail_settings.save",
        after: { credentialsReplaced: true, provider: "resend", senderChanged: true },
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("re_test_key");
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("ops@example.com");
  });

  it("clears the stored row without writing the sender", async () => {
    mocks.findUnique.mockResolvedValue({ provider: "smtp" });

    await clearInstanceMailConfig("user_1");

    expect(mocks.deleteConfig).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.mail_settings.clear",
        after: { result: "cleared" },
        before: { provider: "smtp" },
      }),
      expect.anything(),
    );
    expect(getInstanceMailRuntime()).toBeNull();
  });
});
