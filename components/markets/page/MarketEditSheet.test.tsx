import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarketEditSheet } from "./MarketEditSheet";

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    loading: _loading,
    ...props
  }: ComponentProps<"button"> & { loading?: boolean }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/MenuSelect", () => ({
  MenuSelect: ({ ariaLabel, disabled }: { ariaLabel: string; disabled: boolean }) => (
    <button aria-label={ariaLabel} disabled={disabled} type="button">
      Choose devices
    </button>
  ),
}));
vi.mock("@/components/ui/Sheet", () => ({
  Sheet: ({
    children,
    footer,
    open,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    open: boolean;
    title: string;
  }) =>
    open ? (
      <section aria-label={title} role="dialog">
        {children}
        {footer}
      </section>
    ) : null,
}));

const market = {
  activeKeywordCount: 2,
  canonicalKey: "ES@es",
  countryCode: "ES",
  currentVisibility: null,
  displayName: "Malaga",
  futureKeywordDevices: ["desktop", "mobile"] as ("desktop" | "mobile")[],
  id: "pmkt_abcdefghijklmnopqrstuvwx",
  keywordCount: 2,
  languageLabel: "Spanish",
  locationId: "location_malaga",
  monthlyCostCents: 515,
  name: "Malaga core",
  status: "active" as const,
  topThreeCount: null,
};

describe("MarketEditSheet interaction contract", () => {
  it("uses the design-system device control and prevents a disabled edit from submitting", async () => {
    const onSave = vi.fn(async () => undefined);
    render(
      <MarketEditSheet
        canEdit={false}
        market={market}
        onClose={vi.fn()}
        onSave={onSave}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Market name" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Default devices for future keywords" }),
    ).toBeDisabled();
    expect(document.querySelector("select")).toBeNull();
    expect(
      screen.getByText("Malaga / Spanish cannot be changed after creation."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });
});
