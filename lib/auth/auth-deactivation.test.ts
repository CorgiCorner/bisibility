import type { BetterAuthOptions } from "better-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emailOtpOptions: null as null | { changeEmail?: unknown },
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("better-auth/plugins", async (importOriginal) => {
  const original = await importOriginal<typeof import("better-auth/plugins")>();
  return {
    ...original,
    emailOTP(options: Parameters<typeof original.emailOTP>[0]) {
      mocks.emailOtpOptions = options;
      return original.emailOTP(options);
    },
  };
});

import { auth, preventDeactivatedSessionCreation } from "@/lib/auth/auth";
import { emailOtpTwoFactorPlugin } from "@/lib/auth/email-otp-two-factor";
import { recordPendingFirstRunUser, withFirstRunCreation } from "@/lib/auth/first-run-context";
import { enforceGoogleSignupCapacity } from "@/lib/auth/signin-capacity";
import { sendCloudWelcomeSequence } from "@/lib/auth/welcome-signup";

const session = {
  createdAt: new Date("2026-07-18T00:30:00.000Z"),
  expiresAt: new Date("2026-08-18T00:30:00.000Z"),
  id: "session_1",
  token: "token",
  updatedAt: new Date("2026-07-18T00:30:00.000Z"),
  userId: "user_1",
};

describe("deactivated account session creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires deactivation enforcement and a public ID into session creation", async () => {
    const options = auth.options as BetterAuthOptions;
    const beforeCreate = options.databaseHooks?.session?.create?.before;

    mocks.findUnique.mockResolvedValueOnce({ deactivatedAt: null });
    await expect(beforeCreate?.(session, null)).resolves.toMatchObject({
      data: {
        ...session,
        publicId: expect.stringMatching(/^sid_[a-z][a-z0-9]{23}$/),
      },
    });
    expect(options.databaseHooks?.account?.create?.before).toBe(enforceGoogleSignupCapacity);
    expect(options.databaseHooks?.user?.create?.after).toBe(sendCloudWelcomeSequence);
  });

  it("wires the email OTP two-factor bridge before the cookie integration", () => {
    const options = auth.options as BetterAuthOptions;
    const pluginIds = options.plugins?.map((plugin) => plugin.id);

    expect(pluginIds).toContain(emailOtpTwoFactorPlugin.id);
    expect(pluginIds).toContain("two-factor-route-guard");
    expect(pluginIds?.at(-1)).toBe("next-cookies");
  });

  it("enables only the email OTP change-email flow", () => {
    const options = auth.options as BetterAuthOptions;

    expect(mocks.emailOtpOptions?.changeEmail).toEqual({ enabled: true });
    expect(options.user?.changeEmail).toBeUndefined();
  });

  it("allows an active user to create a session", async () => {
    mocks.findUnique.mockResolvedValueOnce({ deactivatedAt: null });

    await expect(preventDeactivatedSessionCreation(session)).resolves.toBeUndefined();

    expect(mocks.findUnique).toHaveBeenCalledWith({
      select: { deactivatedAt: true },
      where: { id: "user_1" },
    });
  });

  it("allows the uncommitted first-run user to create its session", async () => {
    await withFirstRunCreation(
      {
        appVersion: "test",
        correlationId: "request_1",
        sourceIpHash: null,
        sourceIpMasked: null,
        userAgent: null,
      },
      async () => {
        recordPendingFirstRunUser({ email: "admin@example.com", id: "user_1" });
        await preventDeactivatedSessionCreation(session);
      },
    );

    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["deactivated", { deactivatedAt: new Date("2026-07-18T00:30:00.000Z") }],
    ["missing", null],
  ])("denies session creation for a %s account", async (_state, user) => {
    mocks.findUnique.mockResolvedValueOnce(user);

    await expect(preventDeactivatedSessionCreation(session)).rejects.toMatchObject({
      body: { code: "SESSION_CREATION_BLOCKED", message: "Unable to create session." },
      status: "UNAUTHORIZED",
      statusCode: 401,
    });
  });
});
