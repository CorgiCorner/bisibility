import { PrivacyChoicesLink } from "@/components/analytics/PrivacyChoicesLink";
import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import sharedMessages from "@/messages/core/en/shared.json";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/analytics/ConsentSettingsModal", () => ({
  ConsentSettingsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="consent-settings" /> : null,
}));
afterEach(cleanup);
const choices = () =>
  screen.getByRole("button", { name: sharedMessages.shared.analyticsConsent.title });

it("renders the inline appearance with inherited regular type and no Button classes", () => {
  render(<PrivacyChoicesLink appearance="inline" />);
  expect(choices()).toHaveClass(
    "appearance-none",
    "border-0",
    "bg-transparent",
    "p-0",
    "font-normal",
    "text-inherit",
    "leading-[inherit]",
    "rounded-control",
  );
  expect(choices()).not.toHaveClass("inline-flex");
  expect(choices()).not.toHaveClass("font-semibold");
  expect(choices()).not.toHaveAttribute("data-slot");
});

it("keeps the ghost xs Button as the default appearance", () => {
  render(<PrivacyChoicesLink />);
  expect(choices()).toHaveAttribute("data-slot", "button");
  expect(choices()).toHaveAttribute("data-variant", "ghost");
  expect(choices()).toHaveAttribute("data-size", "xs");
  expect(choices()).not.toHaveClass("appearance-none");
});

it.each(["button", "inline"] as const)(
  "opens the consent modal from the %s appearance",
  (appearance) => {
    render(<PrivacyChoicesLink appearance={appearance} />);
    expect(screen.queryByTestId("consent-settings")).toBeNull();
    fireEvent.click(choices());
    expect(screen.getByTestId("consent-settings")).toBeInTheDocument();
  },
);
