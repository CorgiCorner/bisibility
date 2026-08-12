import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteSignInForm } from "./InviteSignInForm";

const mocks = vi.hoisted(() => ({
  sendVerificationOtp: vi.fn(),
  signIn: vi.fn(),
  signInRedirectUrl: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: mocks.sendVerificationOtp },
    signIn: { emailOtp: mocks.signIn },
  },
}));
vi.mock("@/lib/auth/sign-in-redirect", () => ({
  signInRedirectUrl: mocks.signInRedirectUrl,
}));

describe("InviteSignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/invite/invite_123?source=email#access-details");
  });

  it("preserves the invite URL when email OTP requires a second factor", async () => {
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    const response = { data: { twoFactorRedirect: true }, error: null };
    mocks.signIn.mockResolvedValue(response);
    mocks.signInRedirectUrl.mockReturnValue("#two-factor");
    const user = userEvent.setup();
    render(<InviteSignInForm email="invitee@example.com" />);

    await user.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await user.type(await screen.findByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and return to invite" }));

    await waitFor(() =>
      expect(mocks.signInRedirectUrl).toHaveBeenCalledWith(
        response,
        window.location.origin,
        "/invite/invite_123?source=email&section=access-details",
      ),
    );
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
