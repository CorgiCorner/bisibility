/// <reference types="vite/client" />
import "@/app/globals.css";
import { OtpStep } from "@/components/auth/OtpStep";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { emptyOtpDigits, type LoginFormValues } from "@/lib/auth/login-schema";
import { applyTheme } from "@/lib/theme/browser-theme";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

afterEach(() => {
  cleanup();
  applyTheme("light");
});

function OtpHarness({ onBack }: Readonly<{ onBack: () => void }>) {
  const { control } = useForm<LoginFormValues>({
    defaultValues: { email: "person@example.com", otp: emptyOtpDigits() },
  });
  return (
    <OtpStep
      attempts={0}
      control={control}
      cooldownRemaining={30}
      dataResidencyMessage=""
      email="person@example.com"
      formError={null}
      humanVerificationRequired={false}
      onBack={onBack}
      onDigitEntry={() => {}}
      onResend={async () => {}}
      onSubmit={(event) => event.preventDefault()}
      resentCode={false}
      status="idle"
    />
  );
}

describe.each(["light", "dark"] as const)("Auth navigation in %s", (theme) => {
  it("keeps Back neutral, borderless and padded before returning to email", async () => {
    applyTheme(theme);
    const onBack = vi.fn();
    render(<OtpHarness onBack={onBack} />);
    const back = screen.getByRole("button", { name: "Back" });
    const style = getComputedStyle(back);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopWidth).toBe("0px");
    expect(style.paddingInlineStart).toBe("8px");
    expect(style.paddingInlineEnd).toBe("8px");
    const neutralColor = style.color;
    const width = back.getBoundingClientRect().width;
    await userEvent.hover(back);
    await waitFor(() => expect(getComputedStyle(back).borderTopWidth).toBe("0px"));
    expect(getComputedStyle(back).color).toBe(neutralColor);
    expect(back.getBoundingClientRect().width).toBe(width);
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(["buttons", "links"] as const)(
    "keeps onboarding %s free of row borders while preserving step markers",
    async (navigation) => {
      applyTheme(theme);
      render(
        <OnboardingStepper
          currentStep={2}
          onStepChange={navigation === "buttons" ? vi.fn() : undefined}
        >
          <div>Current panel</div>
        </OnboardingStepper>,
      );
      const rail = screen.getByLabelText("Onboarding steps");
      // Show the desktop rail independently of the browser runner's viewport.
      rail.style.display = "flex";
      const rows = Array.from(rail.children) as HTMLElement[];
      for (const row of rows) {
        const style = getComputedStyle(row);
        expect(style.borderTopWidth).toBe("0px");
        expect(style.borderLeftWidth).toBe("0px");
        expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(style.paddingTop).toBe("11px");
        expect(style.paddingLeft).toBe("0px");
      }
      const current = screen.getByRole(navigation === "buttons" ? "button" : "link", {
        name: "Provider",
      });
      const marker = current.querySelector<HTMLElement>("[data-step-dot-state]");
      if (!marker) throw new Error("The current step marker is missing");
      expect(getComputedStyle(marker).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      await userEvent.hover(current);
      await waitFor(() => expect(getComputedStyle(current).borderTopWidth).toBe("0px"));
      expect(getComputedStyle(current).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    },
  );
});
