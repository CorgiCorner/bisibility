import type { HumanVerificationState } from "@/lib/verification/human-verification-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const mocks = vi.hoisted(() => ({
  requestLoginCode: vi.fn(),
  resendSignInOtp: vi.fn(),
  reset: vi.fn(),
  useHumanVerification: vi.fn(),
}));
vi.mock("@/lib/auth/request-login-code", () => ({ requestLoginCode: mocks.requestLoginCode }));
vi.mock("@/lib/auth/otp-resend", () => ({ resendSignInOtp: mocks.resendSignInOtp }));
vi.mock("@/lib/verification/human-verification-client", () => ({
  useHumanVerification: mocks.useHumanVerification,
}));

function useRequiredVerification(): HumanVerificationState {
  const [token, setToken] = useState<string | null>(null);
  return {
    field: (
      <button onClick={() => setToken("verification-token-123")} type="button">
        Complete challenge
      </button>
    ),
    ok: token !== null,
    reset: () => {
      mocks.reset();
      setToken(null);
    },
    token,
  };
}

const unavailableVerification = (): HumanVerificationState => ({
  field: <p role="status">Human verification is unavailable right now.</p>,
  ok: false,
  reset: mocks.reset,
  token: null,
});

function renderLogin(required: boolean) {
  return render(
    <LoginForm
      dataResidencyMessage=""
      humanVerificationRequired={required}
      legalConsentLinks={null}
    />,
  );
}

function enterEmail() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
}

describe("LoginForm human verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestLoginCode.mockResolvedValue({ ok: true });
    mocks.resendSignInOtp.mockResolvedValue({ ok: true, retryAfter: 60 });
    mocks.useHumanVerification.mockImplementation(useRequiredVerification);
  });

  it("renders the challenge under the email input and gates Cloud submission", () => {
    renderLogin(true);
    enterEmail();
    const email = screen.getByLabelText("Email");
    const challenge = screen.getByRole("button", { name: "Complete challenge" });
    const submit = screen.getByRole("button", { name: "Send login code" });
    expect(
      email.compareDocumentPosition(challenge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      challenge.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(submit).toBeDisabled();
  });

  it("submits the exact token through the server action and resets it", async () => {
    renderLogin(true);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Send login code" }));
    await waitFor(() =>
      expect(mocks.requestLoginCode).toHaveBeenCalledWith({
        email: "person@example.com",
        verificationToken: "verification-token-123",
      }),
    );
    expect(mocks.reset).toHaveBeenCalledOnce();
  });

  it("fails closed with honest copy when verification is unavailable", () => {
    mocks.useHumanVerification.mockReturnValue(unavailableVerification());
    renderLogin(true);
    enterEmail();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Human verification is unavailable right now.",
    );
    expect(screen.getByRole("button", { name: "Send login code" })).toBeDisabled();
    expect(mocks.requestLoginCode).not.toHaveBeenCalled();
  });

  it("does not render or require a challenge for self-host", async () => {
    renderLogin(false);
    enterEmail();
    expect(screen.queryByRole("button", { name: "Complete challenge" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send login code" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Send login code" }));
    await waitFor(() =>
      expect(mocks.requestLoginCode).toHaveBeenCalledWith({
        email: "person@example.com",
        verificationToken: undefined,
      }),
    );
  });

  it.each([
    ["verification_failed", "Verification failed. Please try again."],
    ["rate_limited", "Too many requests. Please try again later."],
  ] as const)("maps %s to neutral error copy", async (code, message) => {
    mocks.requestLoginCode.mockResolvedValue({ code, ok: false });
    renderLogin(true);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Send login code" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByLabelText("Code")).toBeNull();
  });
});

describe("LoginForm resend human verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.requestLoginCode.mockResolvedValue({ ok: true });
    mocks.resendSignInOtp.mockResolvedValue({ ok: true, retryAfter: 60 });
    mocks.useHumanVerification.mockImplementation(useRequiredVerification);
  });

  afterEach(() => vi.useRealTimers());

  async function reachResend(required: boolean) {
    renderLogin(required);
    enterEmail();
    if (required) fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Send login code" }));
    await screen.findByLabelText("Code");
    await vi.advanceTimersByTimeAsync(60_000);
  }

  it("requires a fresh Cloud challenge and submits its token", async () => {
    await reachResend(true);

    expect(screen.getByRole("button", { name: "Resend code" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() =>
      expect(mocks.resendSignInOtp).toHaveBeenCalledWith({
        email: "person@example.com",
        verificationToken: "verification-token-123",
      }),
    );
    expect(mocks.reset).toHaveBeenCalledTimes(2);
  });

  it("never reuses the initial Cloud token for resend", async () => {
    await reachResend(true);

    expect(mocks.resendSignInOtp).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeDisabled();
  });

  it("resets and blocks the challenge after a failed resend", async () => {
    mocks.resendSignInOtp.mockResolvedValue({ code: "rate_limited", ok: false, retryAfter: 0 });
    await reachResend(true);
    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    expect(
      await screen.findByText("Too many requests. Please try again later."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeDisabled();
    expect(mocks.reset).toHaveBeenCalledTimes(2);
  });

  it("keeps self-host resend challenge-free and tokenless", async () => {
    await reachResend(false);

    expect(screen.queryByRole("button", { name: "Complete challenge" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    await waitFor(() =>
      expect(mocks.resendSignInOtp).toHaveBeenCalledWith({
        email: "person@example.com",
        verificationToken: undefined,
      }),
    );
  });
});
