import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { LoginFormValues } from "./login-schema";
import { emptyOtpDigits } from "./login-schema";
import { OtpStep } from "./OtpStep";

function Harness({
  cooldownRemaining,
  otpComplete = false,
  resentCode = false,
  status = "idle",
}: Readonly<{
  cooldownRemaining: number;
  otpComplete?: boolean;
  resentCode?: boolean;
  status?: "idle" | "verifying" | "error";
}>) {
  const { control } = useForm<LoginFormValues>({
    defaultValues: {
      email: "person@example.com",
      otp: otpComplete ? ["1", "2", "3", "4", "5", "6"] : emptyOtpDigits(),
    },
  });

  return (
    <OtpStep
      attempts={0}
      control={control}
      cooldownRemaining={cooldownRemaining}
      dataResidencyMessage=""
      email="person@example.com"
      formError={null}
      onBack={vi.fn()}
      onDigitEntry={vi.fn()}
      onResend={vi.fn().mockResolvedValue(undefined)}
      onSubmit={(event) => event.preventDefault()}
      resentCode={resentCode}
      status={status}
    />
  );
}

describe("OtpStep back action", () => {
  it("provides horizontal hover padding for the Back action", () => {
    render(<Harness cooldownRemaining={0} />);

    expect(screen.getByRole("button", { name: "Back" })).toHaveStyle({ paddingInline: "8px" });
  });
});

describe("OtpStep resend action", () => {
  it("renders the fallback prompt without an encoded entity", () => {
    render(<Harness cooldownRemaining={0} />);

    expect(screen.getByText("Did not get it?")).toBeInTheDocument();
    expect(screen.queryByText(/&apos;/)).toBeNull();
  });

  it("uses a single transparent text-button surface when enabled", () => {
    render(<Harness cooldownRemaining={0} />);

    const resend = screen.getByRole("button", { name: "Resend code" });
    const reservation = screen.getByText("Code sent Resend again in 1:00").parentElement;

    expect(resend.style.backgroundColor).toBe("transparent");
    expect(resend).toHaveStyle({ borderStyle: "none" });
    expect(resend).toHaveStyle({
      minHeight: "36px",
      padding: "0",
    });
    expect(resend).not.toHaveStyle({
      backgroundColor: "var(--accent-soft)",
      borderRadius: "8px",
      paddingInline: "11px",
    });
    expect(resend.querySelectorAll("span")).toHaveLength(3);
    expect(resend.querySelectorAll('[style*="background"]')).toHaveLength(0);
    expect(resend.querySelectorAll('[style*="border-radius"]')).toHaveLength(0);
    expect(reservation).toHaveStyle({ display: "grid" });
  });

  it("keeps cooldown disabled, muted, and background-free", () => {
    render(<Harness cooldownRemaining={56} />);

    const resend = screen.getByRole("button", { name: "Resend in 0:56" });

    expect(resend).toBeDisabled();
    expect(resend.style.backgroundColor).toBe("transparent");
    expect(resend).toHaveStyle({ borderStyle: "none" });
    expect(resend).toHaveStyle({ opacity: "1" });
    expect(resend).not.toHaveStyle({
      backgroundColor: "var(--bg-sunken)",
      paddingInline: "11px",
    });
    expect(resend.querySelectorAll('[style*="background"]')).toHaveLength(0);
  });

  it("keeps the resend action plain until hover and while disabled", () => {
    const view = render(<Harness cooldownRemaining={0} />);

    const resend = screen.getByRole("button", { name: "Resend code" });

    expect(resend).toHaveStyle({ color: "var(--fg)", textDecoration: "none" });
    view.rerender(<Harness cooldownRemaining={56} />);

    expect(screen.getByRole("button", { name: "Resend in 0:56" })).toHaveStyle({
      color: "var(--fg-muted)",
      textDecoration: "none",
    });
  });

  it("shows the resent confirmation and exact countdown without layout shifts", () => {
    const view = render(<Harness cooldownRemaining={45} resentCode />);

    const firstButton = screen.getByRole("button", { name: "Resend again in 0:45" });
    const referenceLabel = screen.getByText("Code sent Resend again in 1:00");
    const labelGrid = referenceLabel.parentElement;

    expect(screen.getByText("Code sent")).toBeInTheDocument();
    expect(labelGrid).toHaveStyle({ display: "grid" });
    expect(referenceLabel).toHaveAttribute("aria-hidden", "true");
    expect(referenceLabel).toHaveStyle({
      gridArea: "1 / 1",
      visibility: "hidden",
      whiteSpace: "nowrap",
    });

    view.rerender(<Harness cooldownRemaining={44} resentCode />);

    expect(screen.getByRole("button", { name: "Resend again in 0:44" })).toBe(firstButton);
    expect(screen.getByText("Code sent Resend again in 1:00")).toBe(referenceLabel);
  });
});

describe("OtpStep verify action", () => {
  it("keeps the idle submit label centered without an icon", () => {
    render(<Harness cooldownRemaining={0} otpComplete />);

    const submit = screen.getByRole("button", { name: "Verify and continue" });

    expect(submit).toBeEnabled();
    expect(submit.querySelector("svg")).toBeNull();
  });

  it("uses text and disabled semantics while verifying without a spinner icon", () => {
    render(<Harness cooldownRemaining={0} otpComplete status="verifying" />);

    const submit = screen.getByRole("button", { name: "Verifying..." });

    expect(submit).toBeDisabled();
    expect(submit.querySelector("svg")).toBeNull();
  });
});
