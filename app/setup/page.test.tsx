import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSession: vi.fn(),
  emailConfigured: vi.fn(),
  firstRun: vi.fn(),
  firstRunAdministratorPending: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireSession: vi.fn(),
}));

vi.mock("@/components/ui", () => ({
  BrandLockup: () => <span data-testid="brand-lockup">bisibility</span>,
  Button: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/lib/auth/first-run", () => ({
  isFirstRun: mocks.firstRun,
  isFirstRunAdministratorPending: mocks.firstRunAdministratorPending,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.adminSession,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.emailConfigured }));
vi.mock("@/lib/seo/noindex", () => ({ createNoindexMetadata: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./actions", () => ({
  signOutAndSwitchAccountAction: vi.fn(),
}));
vi.mock("./SetupWizard", () => ({
  SetupWizard: ({ mailerConfigured }: { mailerConfigured: boolean }) => (
    <div data-mailer-configured={mailerConfigured}>Create administrator account</div>
  ),
}));
vi.mock("./SetupRecoveryAction", () => ({
  SetupRecoveryAction: () => <button type="submit">Complete setup</button>,
}));

import SetupPage from "./page";

describe("administrator setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emailConfigured.mockReturnValue(true);
    mocks.firstRun.mockResolvedValue(false);
    mocks.firstRunAdministratorPending.mockResolvedValue(false);
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.adminSession.mockResolvedValue(null);
  });

  it("renders the account wizard without requiring a session on an empty installation", async () => {
    mocks.firstRun.mockResolvedValue(true);
    mocks.emailConfigured.mockReturnValue(false);

    const markup = renderToStaticMarkup(await SetupPage());

    expect(markup).toContain("Create administrator account");
    expect(markup).toContain('data-mailer-configured="false"');
    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("shows the approved informational page to a signed-in non-admin after setup", async () => {
    const markup = renderToStaticMarkup(await SetupPage());

    expect(markup).toContain("Setup is complete");
    expect(markup).toContain(
      "This instance already has an administrator. If you need admin access, ask them - or a server operator can reassign the role from the command line.",
    );
    expect(markup).toContain("Go to the app");
    expect(markup).toContain("Switch account");
    expect(markup).not.toContain("Create administrator account");
  });

  it("offers recovery to a signed-in non-admin while the instance is adminless", async () => {
    mocks.firstRunAdministratorPending.mockResolvedValue(true);

    const markup = renderToStaticMarkup(await SetupPage());

    expect(markup).toContain("Finish administrator setup");
    expect(markup).toContain(
      "This instance does not have an administrator. Your signed-in account can complete setup now.",
    );
    expect(markup).toContain("Complete setup");
    expect(markup).toContain("Switch account");
    expect(markup).not.toContain("already has an administrator");
  });

  it("sends an anonymous or stale session through normal sign-in after setup", async () => {
    mocks.requireSession.mockRejectedValue(new Error("redirect:/login"));

    await expect(SetupPage()).rejects.toThrow("redirect:/login");

    expect(mocks.adminSession).not.toHaveBeenCalled();
  });

  it("renders the success card server-side for the current administrator", async () => {
    mocks.adminSession.mockResolvedValue({ user: { id: "user_1" } });

    const markup = renderToStaticMarkup(await SetupPage());

    expect(markup).toContain("You&#x27;re the administrator");
    expect(markup).toContain("Open the admin panel");
    expect(markup).toContain(
      "If you ever need to reassign administration, the server operator can do it from the command line.",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
