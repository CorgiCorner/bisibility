import { appRootPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TwoFactorChallengeForm } from "./TwoFactorChallengeForm";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  verifyBackupCode: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    twoFactor: {
      verifyBackupCode: mocks.verifyBackupCode,
      verifyTotp: mocks.verifyTotp,
    },
  },
}));

describe("TwoFactorChallengeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes a pending sign-in after a current authenticator code", async () => {
    mocks.verifyTotp.mockResolvedValue({ data: { token: "session" }, error: null });
    const returnTo = "/oauth/consent?client_id=client_1&scope=openid";
    const { container } = render(<TwoFactorChallengeForm returnTo={returnTo} />);

    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Verify & continue" })).toHaveAttribute(
      "type",
      "button",
    );
    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & continue" }));

    await waitFor(() => expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" }));
    expect(mocks.replace).toHaveBeenCalledWith(returnTo);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("submits the current challenge with the Enter key after hydration", async () => {
    mocks.verifyTotp.mockResolvedValue({ data: { token: "session" }, error: null });
    render(<TwoFactorChallengeForm />);

    const input = screen.getByLabelText("Authenticator code");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" }));
    expect(mocks.replace).toHaveBeenCalledWith(appRootPath());
  });

  it("promotes a pending sign-in after an unused backup code", async () => {
    mocks.verifyBackupCode.mockResolvedValue({ data: { token: "session" }, error: null });
    const returnTo = "/oauth/consent?client_id=client_1&scope=openid";
    render(<TwoFactorChallengeForm returnTo={returnTo} />);

    fireEvent.click(screen.getByRole("button", { name: "Backup code" }));
    fireEvent.change(screen.getByLabelText("Backup code"), {
      target: { value: "abcde-12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & continue" }));

    await waitFor(() =>
      expect(mocks.verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345" }),
    );
    expect(mocks.replace).toHaveBeenCalledWith(returnTo);
  });

  it("falls back to the signed-in home for an unsafe destination", async () => {
    mocks.verifyTotp.mockResolvedValue({ data: { token: "session" }, error: null });
    render(<TwoFactorChallengeForm returnTo="https://evil.example.com" />);

    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & continue" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(appRootPath()));
  });

  it("keeps the return destination when cancelling back to sign in", () => {
    render(<TwoFactorChallengeForm returnTo="/oauth/consent?client_id=client_1&scope=openid" />);

    expect(screen.getByRole("link", { name: "Cancel and return to sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Foauth%2Fconsent%3Fclient_id%3Dclient_1%26scope%3Dopenid",
    );
  });

  it("keeps the default cancellation URL clean", () => {
    render(<TwoFactorChallengeForm />);

    expect(screen.getByRole("link", { name: "Cancel and return to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("rejects a consumed backup code without creating client navigation", async () => {
    mocks.verifyBackupCode.mockResolvedValue({
      data: null,
      error: { code: "INVALID_BACKUP_CODE" },
    });
    render(<TwoFactorChallengeForm />);

    fireEvent.click(screen.getByRole("button", { name: "Backup code" }));
    fireEvent.change(screen.getByLabelText("Backup code"), {
      target: { value: "used1-code1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & continue" }));

    expect(
      await screen.findByText("That code is invalid, expired, or already used."),
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Backup code")).toHaveValue("");
  });
});
