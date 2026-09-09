import { updatePreferences } from "@/app/app/(workspace)/account/preferences/actions";
import {
  deleteAccount,
  revokeSession,
  signOutEverywhere,
  updateAvatar,
  updateProfileName,
} from "@/lib/actions/account";
import {
  confirmAccountEmailChange,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
} from "@/lib/actions/account-email";
import { issuePersonalToken } from "@/lib/api/pat-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  write: vi.fn(),
  auth: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      sendVerificationOTP: mocks.auth,
      changeEmailEmailOTP: mocks.auth,
      requestEmailChangeEmailOTP: mocks.auth,
    },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/queries/account", () => ({ persistDateFormatPreference: mocks.write }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.write,
    user: { findUnique: mocks.write, update: mocks.write },
    personalAccessToken: { create: mocks.write },
    session: { deleteMany: mocks.write },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    READ_ONLY_DEMO: "1",
    DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
    DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
    DEMO_FIXED_OTP: "0",
    ALLOW_INSECURE_FIXED_OTP: "0",
  }))
    vi.stubEnv(key, value);
  mocks.session.mockResolvedValue({
    user: { id: "demo", email: "demo@example.com" },
    session: { id: "visitor-session" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("direct demo account mutations", () => {
  it.each([
    ["email code", () => requestAccountEmailChangeCode()],
    [
      "email change",
      () => requestAccountEmailChange({ currentCode: "000000", newEmail: "other@example.com" }),
    ],
    [
      "email confirmation",
      () => confirmAccountEmailChange({ code: "000000", newEmail: "other@example.com" }),
    ],
    ["name", () => updateProfileName({ name: "Changed" })],
    ["avatar", () => updateAvatar({ image: "https://example.com/avatar.png" })],
    ["delete", () => deleteAccount({ email: "demo@example.com" })],
    ["revoke another session", () => revokeSession({ sessionId: "another-visitor" })],
    ["sign out everyone", () => signOutEverywhere()],
    ["preferences", () => updatePreferences({})],
    ["token", () => issuePersonalToken("demo", { name: "Token", expiresInDays: 1, scope: "read" })],
  ])("denies %s before auth/DB side effects", async (_label, action) => {
    await expect(action()).rejects.toThrow("Account settings are locked in this demo.");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
