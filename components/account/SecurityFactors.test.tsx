import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityFactors } from "./SecurityFactors";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  complete: vi.fn(),
  disable: vi.fn(),
  refresh: vi.fn(),
  regenerate: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/actions/two-factor", () => ({
  beginTwoFactorEnrollmentAction: mocks.begin,
  completeTwoFactorEnrollmentAction: mocks.complete,
  disableTwoFactorAction: mocks.disable,
  regenerateTwoFactorBackupCodesAction: mocks.regenerate,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signOut: mocks.signOut },
}));

function enrollmentStarted() {
  return {
    ok: true,
    value: {
      enrollmentId: "11111111-1111-4111-8111-111111111111",
      expiresAt: "2026-07-27T12:10:00.000Z",
      secret: "ABC123",
      totpURI: "otpauth://totp/Bisibility:jan@example.com?secret=ABC123&issuer=Bisibility",
    },
  };
}

describe("SecurityFactors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.begin.mockResolvedValue(enrollmentStarted());
    mocks.complete.mockResolvedValue({
      ok: true,
      value: { backupCodes: ["abcde-12345"], replaced: false },
    });
    mocks.disable.mockResolvedValue({ ok: true, value: { signedOut: true } });
    mocks.regenerate.mockResolvedValue({
      ok: true,
      value: { backupCodes: ["vwxyz-67890"] },
    });
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  });

  it("reveals backup codes only after the new authenticator is verified", async () => {
    render(<SecurityFactors hasPasswordCredential initiallyEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.begin).toHaveBeenCalledWith({
        code: "",
        method: "totp",
        password: "password",
      }),
    );
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(screen.queryByText("abcde-12345")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mocks.complete).toHaveBeenCalledWith({
        code: "123456",
        enrollmentId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(await screen.findByText("abcde-12345")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("requires a current authenticator code before regenerating backup codes", async () => {
    render(<SecurityFactors hasPasswordCredential={false} initiallyEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Backup codes" }));
    fireEvent.change(screen.getByLabelText("Current authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate new backup codes" }));

    await waitFor(() =>
      expect(mocks.regenerate).toHaveBeenCalledWith({
        code: "123456",
        method: "totp",
        password: "",
      }),
    );
    expect(await screen.findByText("vwxyz-67890")).toBeInTheDocument();
  });

  it("accepts a backup code to replace a lost authenticator", async () => {
    mocks.complete.mockResolvedValue({
      ok: true,
      value: { backupCodes: ["newer-54321"], replaced: true },
    });
    render(<SecurityFactors hasPasswordCredential={false} initiallyEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Replace authenticator" }));
    fireEvent.click(screen.getByRole("button", { name: "Backup code" }));
    fireEvent.change(screen.getByLabelText("Current backup code"), {
      target: { value: "abcde-12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.begin).toHaveBeenCalledWith({
        code: "abcde-12345",
        method: "backup_code",
        password: "",
      }),
    );
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
  });

  it("accepts a backup code for disable and signs out every session", async () => {
    render(<SecurityFactors hasPasswordCredential={false} initiallyEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    fireEvent.click(screen.getByRole("button", { name: "Backup code" }));
    fireEvent.change(screen.getByLabelText("Current backup code"), {
      target: { value: "abcde-12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Disable two-factor authentication" }));

    await waitFor(() =>
      expect(mocks.disable).toHaveBeenCalledWith({
        code: "abcde-12345",
        method: "backup_code",
        password: "",
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps 2FA enabled when the protected action rejects verification", async () => {
    mocks.disable.mockResolvedValue({
      error: { code: "step_up_failed", message: "Verification failed.", status: 401 },
      ok: false,
    });
    render(<SecurityFactors hasPasswordCredential={false} initiallyEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    fireEvent.change(screen.getByLabelText("Current authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Disable two-factor authentication" }));

    expect(await screen.findByText("Verification failed.")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("offers an explicit sign-in flow when the initial-enrollment session is stale", async () => {
    mocks.begin.mockResolvedValue({
      error: {
        code: "session_not_fresh",
        message: "Sign out and sign in again before enabling two-factor authentication.",
        status: 403,
      },
      ok: false,
    });
    render(<SecurityFactors hasPasswordCredential={false} initiallyEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign in again" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fapp%2Faccount%2Fsecurity");
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
