import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditContext: vi.fn(),
  firstRun: vi.fn(),
  headers: vi.fn(),
  promote: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireSession: vi.fn(),
  sendCode: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      sendVerificationOTP: mocks.sendCode,
      signOut: mocks.signOut,
    },
  },
}));
vi.mock("@/lib/auth/first-run", () => ({
  isFirstRun: mocks.firstRun,
}));
vi.mock("@/lib/auth/first-run-account", () => ({
  promoteFirstRunAdministrator: mocks.promote,
}));
vi.mock("@/lib/auth/request-context", () => ({
  getAuditRequestContext: mocks.auditContext,
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  completeSetupAction,
  requestSetupCodeAction,
  signOutAndSwitchAccountAction,
} from "./actions";

const requestContext = {
  appVersion: "test",
  correlationId: "request_1",
  sourceIpHash: null,
  sourceIpMasked: null,
  userAgent: null,
};

const values = {
  email: "admin@example.com",
  name: "Admin",
  otp: ["1", "2", "3", "4", "5", "6"],
};

describe("administrator setup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditContext.mockResolvedValue(requestContext);
    mocks.firstRun.mockResolvedValue(true);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "visitor=1" }));
    mocks.promote.mockResolvedValue("promoted");
    mocks.requireSession.mockResolvedValue({
      user: { email: "admin@example.com", id: "user_admin" },
    });
    mocks.sendCode.mockResolvedValue({});
    mocks.signOut.mockResolvedValue({ success: true });
  });

  it("sends a verification code while setup is pending", async () => {
    await expect(requestSetupCodeAction(values)).resolves.toEqual({ status: "ready" });

    expect(mocks.sendCode).toHaveBeenCalledWith({
      body: { email: "admin@example.com", type: "sign-in" },
    });
  });

  it("promotes only the authenticated caller and exposes the client success step", async () => {
    await expect(completeSetupAction()).resolves.toEqual({ status: "complete" });

    expect(mocks.promote).toHaveBeenCalledWith("user_admin", "admin@example.com", requestContext);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("requires an authenticated session before promotion", async () => {
    mocks.requireSession.mockRejectedValue(new Error("redirect:/login"));

    await expect(completeSetupAction()).rejects.toThrow("redirect:/login");

    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.auditContext).not.toHaveBeenCalled();
  });

  it("signs out a race loser and returns the completed error", async () => {
    mocks.promote.mockResolvedValue("administrator_exists");

    await expect(completeSetupAction()).resolves.toEqual({
      message: "Administrator setup is already complete. Sign in to continue.",
      status: "error",
    });

    expect(mocks.signOut).toHaveBeenCalledOnce();
    const signOutHeaders = mocks.signOut.mock.calls[0]?.[0].headers as Headers;
    expect(signOutHeaders.get("cookie")).toBe("visitor=1");
  });

  it("keeps the session when promotion is retryable on an adminless instance", async () => {
    mocks.promote.mockResolvedValue("retry");

    await expect(completeSetupAction()).resolves.toEqual({
      field: "otp",
      message: "We could not finish setup. Try again.",
      status: "error",
    });

    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("keeps the session when the promotion transaction throws", async () => {
    mocks.promote.mockRejectedValue(new Error("database unavailable"));

    await expect(completeSetupAction()).resolves.toEqual({
      field: "otp",
      message: "We could not finish setup. Try again.",
      status: "error",
    });

    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out through Better Auth and redirects to login", async () => {
    const requestHeaders = new Headers({ cookie: "session=test" });
    mocks.headers.mockResolvedValue(requestHeaders);

    await expect(signOutAndSwitchAccountAction()).rejects.toThrow("redirect:/login");

    expect(mocks.signOut).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
