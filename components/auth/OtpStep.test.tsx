import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { LoginFormValues } from "./login-schema";
import { emptyOtpDigits } from "./login-schema";
import { OtpStep } from "./OtpStep";

function Harness({ cooldownRemaining }: Readonly<{ cooldownRemaining: number }>) {
  const { control } = useForm<LoginFormValues>({
    defaultValues: { email: "person@example.com", otp: emptyOtpDigits() },
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
      status="idle"
    />
  );
}

describe("OtpStep resend action", () => {
  it("gives the enabled Resend action compact visible button chrome", () => {
    render(<Harness cooldownRemaining={0} />);

    const resend = screen.getByRole("button", { name: "Resend code" });
    const back = screen.getByRole("button", { name: "Back" });
    const labelChrome = screen.getByText("Resend in 1:00").parentElement;

    expect(labelChrome).toHaveStyle({
      backgroundColor: "var(--accent-soft)",
      borderRadius: "8px",
      paddingBlock: "6px",
      paddingInline: "11px",
    });
    expect(resend).toHaveStyle({
      minHeight: "36px",
      padding: "0",
    });
    expect(resend).not.toHaveStyle({
      backgroundColor: "var(--accent-soft)",
      borderRadius: "8px",
      paddingInline: "11px",
    });
    expect(back).toHaveStyle({ padding: "0" });
    expect(back).not.toHaveStyle({
      backgroundColor: "var(--accent-soft)",
      minHeight: "36px",
      paddingInline: "10px",
    });
  });

  it("keeps visible inset and muted chrome on the disabled countdown", () => {
    render(<Harness cooldownRemaining={56} />);

    const resend = screen.getByRole("button", { name: "Resend in 0:56" });
    const labelChrome = screen.getByText("Resend in 1:00").parentElement;

    expect(resend).toBeDisabled();
    expect(labelChrome).toHaveStyle({
      backgroundColor: "var(--bg-sunken)",
      color: "var(--fg-muted)",
      paddingInline: "11px",
    });
    expect(resend).toHaveStyle({
      opacity: "1",
      padding: "0",
    });
    expect(resend).not.toHaveStyle({
      backgroundColor: "var(--bg-sunken)",
      paddingInline: "11px",
    });
  });

  it("keeps the hidden reference label overlaid while the countdown changes", () => {
    const view = render(<Harness cooldownRemaining={59} />);

    const firstButton = screen.getByRole("button", { name: "Resend in 0:59" });
    const referenceLabel = screen.getByText("Resend in 1:00");
    const labelGrid = referenceLabel.parentElement;

    expect(labelGrid).toHaveStyle({ display: "grid" });
    expect(referenceLabel).toHaveAttribute("aria-hidden", "true");
    expect(referenceLabel).toHaveStyle({
      gridArea: "1 / 1",
      visibility: "hidden",
      whiteSpace: "nowrap",
    });

    view.rerender(<Harness cooldownRemaining={58} />);

    expect(screen.getByRole("button", { name: "Resend in 0:58" })).toBe(firstButton);
    expect(screen.getByText("Resend in 1:00")).toBe(referenceLabel);
  });
});
