import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  context: vi.fn(),
  disable: vi.fn(),
  headers: vi.fn(),
  regenerate: vi.fn(),
  requireSession: vi.fn(),
  signOut: vi.fn(),
  unstableRethrow: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: { api: { signOut: mocks.signOut } } }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/auth/two-factor-management-context", () => ({
  getTwoFactorSecurityContext: mocks.context,
}));
vi.mock("@/lib/auth/two-factor-step-up", () => ({
  authorizeTwoFactorOperation: mocks.authorize,
}));
vi.mock("@/lib/auth/two-factor-management", () => ({
  beginTwoFactorEnrollment: mocks.begin,
  completeTwoFactorEnrollment: mocks.complete,
  disableTwoFactor: mocks.disable,
  enrollmentOperation: (context: { twoFactorEnabled: boolean }) =>
    context.twoFactorEnabled ? "replace" : "enroll",
  regenerateTwoFactorBackupCodes: mocks.regenerate,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.unstableRethrow }));

import {
  beginTwoFactorEnrollmentAction,
  disableTwoFactorAction,
  regenerateTwoFactorBackupCodesAction,
} from "./two-factor";

const passwordlessContext = {
  actorId: "user_1",
  actorPublicId: "usr_abcdefghijklmnopqrstuvwx",
  credentialPasswordHash: null,
  email: "user@example.com",
  sessionCreatedAt: new Date(),
  sessionId: "session_1",
  twoFactorEnabled: true,
};

describe("two-factor management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      session: { id: "session_1" },
      user: { id: "user_1" },
    });
    mocks.context.mockResolvedValue(passwordlessContext);
    mocks.authorize.mockResolvedValue("grant_1");
    mocks.begin.mockResolvedValue({ enrollmentId: "enrollment_1" });
    mocks.regenerate.mockResolvedValue({ backupCodes: ["abcde-12345"] });
    mocks.disable.mockResolvedValue({ signedOut: true });
    mocks.headers.mockResolvedValue(new Headers({ cookie: "session=test" }));
    mocks.signOut.mockResolvedValue({ success: true });
    mocks.unstableRethrow.mockImplementation((error: { digest?: string }) => {
      if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    });
  });

  it("returns an ActionResult for invalid input instead of throwing ZodError", async () => {
    await expect(
      disableTwoFactorAction({ code: "not-a-code", method: "totp", password: "" }),
    ).resolves.toMatchObject({
      error: { code: "invalid_input", status: 400 },
      ok: false,
    });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("enforces the credential password rule from authoritative server state", async () => {
    mocks.context.mockResolvedValue({
      ...passwordlessContext,
      credentialPasswordHash: "stored-password-hash",
    });

    await expect(
      disableTwoFactorAction({ code: "123456", method: "totp", password: "" }),
    ).resolves.toMatchObject({
      error: { code: "invalid_input", message: "Enter your account password.", status: 400 },
      ok: false,
    });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("authorizes backup-code regeneration with a one-time operation grant", async () => {
    await expect(
      regenerateTwoFactorBackupCodesAction({
        code: "abcde-12345",
        method: "backup_code",
        password: "",
      }),
    ).resolves.toEqual({ ok: true, value: { backupCodes: ["abcde-12345"] } });

    expect(mocks.authorize).toHaveBeenCalledWith(passwordlessContext, "regenerate", {
      code: "abcde-12345",
      method: "backup_code",
      password: "",
    });
    expect(mocks.regenerate).toHaveBeenCalledWith(passwordlessContext, "grant_1");
  });

  it("revokes the browser session after transactional disable succeeds", async () => {
    await expect(
      disableTwoFactorAction({ code: "123456", method: "totp", password: "" }),
    ).resolves.toEqual({ ok: true, value: { signedOut: true } });

    expect(mocks.authorize).toHaveBeenCalledWith(passwordlessContext, "disable", {
      code: "123456",
      method: "totp",
      password: "",
    });
    expect(mocks.disable).toHaveBeenCalledWith(passwordlessContext, "grant_1");
    expect(mocks.signOut).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("requires current-factor step-up before replacing an enabled authenticator", async () => {
    await beginTwoFactorEnrollmentAction({
      code: "123456",
      method: "totp",
      password: "",
    });

    expect(mocks.authorize).toHaveBeenCalledWith(passwordlessContext, "replace", {
      code: "123456",
      method: "totp",
      password: "",
    });
    expect(mocks.begin).toHaveBeenCalledWith(passwordlessContext, "grant_1");
  });

  it("preserves the Next redirect thrown for an expired session", async () => {
    const redirectError = { digest: "NEXT_REDIRECT;replace;/login;307;" };
    mocks.requireSession.mockRejectedValue(redirectError);

    await expect(
      beginTwoFactorEnrollmentAction({ code: "", method: "totp", password: "" }),
    ).rejects.toBe(redirectError);
  });
});
