import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountView: vi.fn(),
  getAccount: vi.fn(),
  getPersonalTokens: vi.fn(),
  getPreferences: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/account/AccountShell", () => ({
  AccountShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/account/PersonalTokensSection", () => ({
  PersonalTokensSection: () => <div data-testid="personal-tokens" />,
}));
vi.mock("@/components/account/SecurityFactors", () => ({
  SecurityFactors: () => <div data-testid="security-factors" />,
}));
vi.mock("@/components/account/SessionsSection", () => ({
  SessionsSection: () => <div data-testid="sessions" />,
}));
vi.mock("@/lib/actions/personalToken", () => ({
  issuePersonalTokenAction: vi.fn(),
  revokePersonalTokenAction: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/demo/account-view", () => ({ resolveDemoAccountView: mocks.accountView }));
vi.mock("@/lib/queries/account", () => ({
  getAccount: mocks.getAccount,
  getPreferences: mocks.getPreferences,
}));
vi.mock("@/lib/queries/personal-tokens", () => ({ getPersonalTokens: mocks.getPersonalTokens }));
vi.mock("../actions", () => ({ revokeSession: vi.fn(), signOutEverywhere: vi.fn() }));

import SecurityPage from "./page";

describe("SecurityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountView.mockResolvedValue("normal");
    mocks.getAccount.mockResolvedValue({ hasPasswordCredential: true, twoFactorEnabled: true });
    mocks.getPersonalTokens.mockResolvedValue([]);
    mocks.getPreferences.mockResolvedValue({ dateFormat: "auto" });
    mocks.requireSession.mockResolvedValue({ user: { id: "owner_1" } });
  });

  it("stops an editable Viewer before loading sessions or tokens", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "viewer_1" } });
    mocks.accountView.mockResolvedValue("locked");

    render(await SecurityPage());

    expect(screen.getByRole("heading", { name: "Demo account" })).toBeVisible();
    expect(mocks.getAccount).not.toHaveBeenCalled();
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.getPersonalTokens).not.toHaveBeenCalled();
  });

  it("loads normal security data only for a revalidated Owner", async () => {
    render(await SecurityPage());

    expect(mocks.accountView).toHaveBeenCalledWith("owner_1");
    expect(mocks.getPersonalTokens).toHaveBeenCalledWith("owner_1");
    expect(screen.getByTestId("security-factors")).toBeVisible();
  });
});
