import { renderWithAccountMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountView: vi.fn(),
  getAccount: vi.fn(),
  getPersonalTokens: vi.fn(),
  getConnectedApps: vi.fn(),
  getPreferences: vi.fn(),
  requireSession: vi.fn(),
  SessionsSection: vi.fn(),
  SecurityFactors: vi.fn(),
}));

vi.mock("@/components/account/AccountShell", () => ({
  AccountShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/account/PersonalTokensSection", () => ({
  PersonalTokensSection: () => <div data-testid="personal-tokens" />,
}));
vi.mock("@/components/account/SecurityFactors", () => ({
  SecurityFactors: (props: unknown) => {
    mocks.SecurityFactors(props);
    return <div data-testid="security-factors" />;
  },
}));
vi.mock("@/components/account/SessionsSection", () => ({
  SessionsSection: (props: unknown) => {
    mocks.SessionsSection(props);
    return <div data-testid="sessions" />;
  },
}));
vi.mock("@/lib/actions/connected-apps", () => ({ revokeConnectedApp: vi.fn() }));
vi.mock("@/lib/queries/connected-apps", () => ({ getConnectedApps: mocks.getConnectedApps }));
vi.mock("@/components/account/ConnectedAppsSection", () => ({
  ConnectedAppsSection: () => <div data-testid="connected-apps" />,
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
    mocks.getConnectedApps.mockResolvedValue([]);
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
    expect(mocks.getConnectedApps).not.toHaveBeenCalled();
  });

  it("loads normal security data only for a revalidated Owner", async () => {
    render(await SecurityPage());

    expect(mocks.accountView).toHaveBeenCalledWith("owner_1");
    expect(mocks.getPersonalTokens).toHaveBeenCalledWith("owner_1");
    expect(mocks.getConnectedApps).toHaveBeenCalledWith("owner_1");
    expect(screen.getByTestId("connected-apps")).toBeVisible();
    expect(screen.getByTestId("security-factors")).toBeVisible();
  });

  it("passes a serialized reference time into the client session surface", async () => {
    render(await SecurityPage());

    const [props] = mocks.SessionsSection.mock.calls.at(-1) ?? [];

    expect(props).toEqual(
      expect.objectContaining({
        referenceTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      }),
    );
  });
  it.each([
    "/app/admin/billing?section=accounts",
    "https://evil.test/app/admin",
    "//evil.test/app/admin",
    "/login",
  ])("validates returnTo %s before passing it to enrollment", async (returnTo) => {
    await SecurityPage({ searchParams: Promise.resolve({ returnTo }) }).then(render);
    expect(mocks.SecurityFactors).toHaveBeenCalledWith(
      expect.objectContaining({ returnTo: returnTo.startsWith("/app/") ? returnTo : undefined }),
    );
  });
});
