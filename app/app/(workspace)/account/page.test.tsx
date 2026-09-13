import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AccountEmailCard: vi.fn(),
  confirmAccountEmailChange: vi.fn(),
  confirmCurrentAccountEmailVerification: vi.fn(),
  demoAccountView: vi.fn(),
  getAccount: vi.fn(),
  requireSession: vi.fn(),
  requestAccountEmailChange: vi.fn(),
  requestAccountEmailChangeCode: vi.fn(),
  requestCurrentAccountEmailVerification: vi.fn(),
}));

vi.mock("@/components/account/AccountEmailCard", () => ({
  AccountEmailCard: mocks.AccountEmailCard,
}));
vi.mock("@/components/account/AccountShell", () => ({
  AccountShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/account/ConnectedAccounts", () => ({
  ConnectedAccounts: () => <div data-testid="connected-accounts" />,
}));
vi.mock("@/components/account/DeleteAccount", () => ({
  DeleteAccount: () => <div data-testid="delete-account" />,
}));
vi.mock("@/components/account/ProfileSection", () => ({
  ProfileSection: () => <div data-testid="profile-section" />,
}));
vi.mock("@/components/analytics/PrivacyChoicesLink", () => ({
  PrivacyChoicesLink: () => <button type="button">Privacy choices</button>,
}));
vi.mock("@/lib/queries/account", () => ({
  getAccount: mocks.getAccount,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/demo/account-view", () => ({
  resolveDemoAccountView: mocks.demoAccountView,
}));
vi.mock("@/lib/actions/account-email", () => ({
  confirmAccountEmailChange: mocks.confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification: mocks.confirmCurrentAccountEmailVerification,
  requestAccountEmailChange: mocks.requestAccountEmailChange,
  requestAccountEmailChangeCode: mocks.requestAccountEmailChangeCode,
  requestCurrentAccountEmailVerification: mocks.requestCurrentAccountEmailVerification,
}));
vi.mock("./actions", () => ({
  deleteAccount: vi.fn(),
  updateProfile: vi.fn(),
}));

import AccountPage from "@/app/app/(workspace)/account/page";

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.AccountEmailCard.mockImplementation(() => <div data-testid="account-email-card" />);
    mocks.demoAccountView.mockResolvedValue("normal");
    mocks.requireSession.mockResolvedValue({ user: { id: "owner_1" } });
    mocks.getAccount.mockResolvedValue({
      connectedAccounts: [],
      email: "owner@example.com",
      emailVerified: true,
      hasPasswordCredential: false,
      image: null,
      name: "Owner",
      publicId: "usr_1",
      sessions: [],
      twoFactorEnabled: false,
    });
  });

  it("wires the audited account email server actions into the account email card", async () => {
    render(await AccountPage());

    const [props] = mocks.AccountEmailCard.mock.calls.at(-1) ?? [];

    expect(props).toEqual(
      expect.objectContaining({
        confirmAccountEmailChange: mocks.confirmAccountEmailChange,
        confirmCurrentAccountEmailVerification: mocks.confirmCurrentAccountEmailVerification,
        email: "owner@example.com",
        emailVerified: true,
        requestAccountEmailChange: mocks.requestAccountEmailChange,
        requestAccountEmailChangeCode: mocks.requestAccountEmailChangeCode,
        requestCurrentAccountEmailVerification: mocks.requestCurrentAccountEmailVerification,
      }),
    );
    expect(screen.getByTestId("account-email-card")).toBeInTheDocument();
  });

  it("renders the account email card alongside other account sections", async () => {
    render(await AccountPage());

    expect(mocks.AccountEmailCard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("account-email-card")).toBeInTheDocument();
    expect(screen.getByTestId("profile-section")).toBeInTheDocument();
    expect(screen.getByTestId("connected-accounts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Privacy choices" })).toBeVisible();
  });

  it("stops an editable Viewer before profile and account queries", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "viewer_1" } });
    mocks.demoAccountView.mockResolvedValue("locked");

    render(await AccountPage());

    expect(screen.getByRole("heading", { name: "Demo account" })).toBeVisible();
    expect(mocks.demoAccountView).toHaveBeenCalledWith("viewer_1");
    expect(mocks.getAccount).not.toHaveBeenCalled();
  });

  it("keeps the normal profile screen for a revalidated Owner", async () => {
    render(await AccountPage());

    expect(mocks.demoAccountView).toHaveBeenCalledWith("owner_1");
    expect(mocks.getAccount).toHaveBeenCalledOnce();
    expect(screen.getByTestId("profile-section")).toBeVisible();
  });
});
