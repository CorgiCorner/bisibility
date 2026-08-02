import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  requestCode: vi.fn(),
  signIn: vi.fn(),
  signInRedirectUrl: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { emailOtp: mocks.signIn } },
}));
vi.mock("@/lib/auth/sign-in-redirect", () => ({
  signInRedirectUrl: mocks.signInRedirectUrl,
}));
vi.mock("./actions", () => ({
  completeSetupAction: mocks.complete,
  requestSetupCodeAction: mocks.requestCode,
}));

import { SetupWizard } from "./SetupWizard";

async function enterAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Alex Admin");
  await user.type(screen.getByLabelText("Email address"), "admin@example.com");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

async function enterOtp(user: ReturnType<typeof userEvent.setup>) {
  const labels = [
    "Code",
    "Code digit 2",
    "Code digit 3",
    "Code digit 4",
    "Code digit 5",
    "Code digit 6",
  ];
  for (const [index, label] of labels.entries()) {
    await user.type(screen.getByLabelText(label), String(index + 1));
  }
}

describe("SetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestCode.mockResolvedValue({ status: "ready" });
    mocks.complete.mockResolvedValue({ status: "complete" });
    mocks.signIn.mockResolvedValue({ data: { user: { id: "user_admin" } }, error: null });
    mocks.signInRedirectUrl.mockReturnValue(null);
  });

  it("keeps the mailer-backed verification flow unchanged", async () => {
    const user = userEvent.setup();
    render(<SetupWizard mailerConfigured />);

    await enterAccount(user);

    expect(mocks.requestCode).toHaveBeenCalledWith({
      email: "admin@example.com",
      name: "Alex Admin",
      otp: ["", "", "", "", "", ""],
    });
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText(/We sent a 6-digit code to/)).toBeInTheDocument();
    expect(screen.queryByText(/printed your code in the server logs/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and create account" })).toBeDisabled();
    expect(document.querySelector('[data-step-state="complete"]')).toBeInTheDocument();
    expect(document.querySelector('[data-step-state="current"]')).toHaveTextContent("2");
  });

  it("completes the no-mailer first-run flow through the log and success states", async () => {
    const user = userEvent.setup();
    render(<SetupWizard mailerConfigured={false} />);

    await enterAccount(user);

    expect(
      screen.getByRole("heading", { name: "Grab the code from your logs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Email delivery isn't configured yet, so we printed your code in the server logs. Reading it there confirms you control this server.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("[auth] setup code for admin@example.com: ******")).toBeInTheDocument();

    await enterOtp(user);
    await user.click(screen.getByRole("button", { name: "Verify and create account" }));

    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "admin@example.com",
      fetchOptions: {
        headers: {
          "x-bisibility-first-run": "setup",
        },
      },
      name: "Alex Admin",
      otp: "123456",
    });
    expect(mocks.complete).toHaveBeenCalledWith();
    expect(mocks.signIn.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.complete.mock.invocationCallOrder[0] ?? 0,
    );
    expect(screen.getByRole("heading", { name: "You're the administrator" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "If you ever need to reassign administration, the server operator can do it from the command line.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Next: configure email delivery.")).toBeInTheDocument();
    expect(
      screen.getByText(/add one to your server configuration before inviting anyone/),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-step-state="complete"]')).toHaveLength(2);
    expect(document.querySelector('[data-step-state="current"]')).toHaveTextContent("3");
  });

  it("hands an unexpected second-factor challenge to the auth redirect owner", async () => {
    const response = { data: { twoFactorRedirect: true }, error: null };
    mocks.signIn.mockResolvedValue(response);
    mocks.signInRedirectUrl.mockReturnValue("#two-factor");
    const user = userEvent.setup();
    render(<SetupWizard mailerConfigured={false} />);

    await enterAccount(user);
    await enterOtp(user);
    await user.click(screen.getByRole("button", { name: "Verify and create account" }));

    expect(mocks.signInRedirectUrl).toHaveBeenCalledWith(response, window.location.origin);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
