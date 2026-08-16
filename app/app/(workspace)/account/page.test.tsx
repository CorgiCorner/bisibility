import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AccountEmailCard: vi.fn(),
  confirmAccountEmailChange: vi.fn(),
  confirmCurrentAccountEmailVerification: vi.fn(),
  getAccount: vi.fn(),
  requestAccountEmailChange: vi.fn(),
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
vi.mock("@/lib/queries/account", () => ({
  getAccount: mocks.getAccount,
}));
vi.mock("@/lib/actions/account-email", () => ({
  confirmAccountEmailChange: mocks.confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification: mocks.confirmCurrentAccountEmailVerification,
  requestAccountEmailChange: mocks.requestAccountEmailChange,
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
  });
});
