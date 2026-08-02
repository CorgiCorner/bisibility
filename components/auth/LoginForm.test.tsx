import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const mocks = vi.hoisted(() => ({
  emailOtpSignIn: vi.fn(),
  sendVerificationOtp: vi.fn(),
  signInRedirectUrl: vi.fn(),
  socialSignIn: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: mocks.sendVerificationOtp },
    signIn: { emailOtp: mocks.emailOtpSignIn, social: mocks.socialSignIn },
  },
}));
vi.mock("@/lib/auth/otp-resend", () => ({ resendSignInOtp: vi.fn() }));
vi.mock("@/lib/auth/sign-in-redirect", () => ({
  signInRedirectUrl: mocks.signInRedirectUrl,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const capacity = {
  emailCodes: { binding: "daily" as const, cap: 200, left: 1 },
  googleSpots: { cap: 100, left: 14 },
  signupsToday: 26,
};

describe("LoginForm capacity errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInRedirectUrl.mockReturnValue("#two-factor");
    window.history.replaceState(null, "", "/login");
  });

  it("keeps the browser fragment out of OAuth callback fields", async () => {
    mocks.socialSignIn.mockResolvedValue({});
    window.history.replaceState(null, "", "/login?next=%2Fapp%2Fsettings#api-keys");
    const user = userEvent.setup();
    render(
      <LoginForm
        dataResidencyMessage=""
        enabledProviders={{ github: false, google: true }}
        legalConsentLinks={{ privacyHref: "/privacy", termsHref: "/terms" }}
        returnTo="/app/settings"
      />,
    );

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() =>
      expect(mocks.socialSignIn).toHaveBeenCalledWith({
        callbackURL: "/app/settings?section=api-keys",
        errorCallbackURL: "/login?next=%2Fapp%2Fsettings%3Fsection%3Dapi-keys",
        provider: "google",
      }),
    );
  });

  it("maps a typed email rejection to the just-missed panel without navigation", async () => {
    mocks.sendVerificationOtp.mockResolvedValue({
      error: { code: "capacity_exhausted", message: "capacity_exhausted" },
    });
    const user = userEvent.setup();
    render(
      <LoginForm
        capacity={capacity}
        dataResidencyMessage="Your data is stored and processed in the EU."
        legalConsentLinks={{ privacyHref: "/privacy", termsHref: "/terms" }}
      />,
    );

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send login code/i }));

    expect(
      await screen.findByText(/The last login codes went out while you were on this page/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText("capacity_exhausted")).toBeNull();
  });

  it("passes the return destination into the email OTP redirect decision", async () => {
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    const response = { data: { twoFactorRedirect: true }, error: null };
    mocks.emailOtpSignIn.mockResolvedValue(response);
    window.history.replaceState(null, "", "/login#review-access");
    const user = userEvent.setup();
    const returnTo =
      "/oauth/consent?client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A51008%2Fcallback&scope=openid";
    render(<LoginForm dataResidencyMessage="" legalConsentLinks={null} returnTo={returnTo} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send login code/i }));
    await screen.findByLabelText("Code");
    for (const [index, digit] of [..."123456"].entries()) {
      await user.type(
        screen.getByLabelText(index === 0 ? "Code" : `Code digit ${index + 1}`),
        digit,
      );
    }
    await user.click(screen.getByRole("button", { name: "Verify & continue" }));

    await waitFor(() =>
      expect(mocks.signInRedirectUrl).toHaveBeenCalledWith(
        response,
        window.location.origin,
        `${returnTo}&section=review-access`,
      ),
    );
  });
});
