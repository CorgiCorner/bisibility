import type { PricingPopoverProps } from "@/components/ui/PricingPopover";
import {
  backlinksFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyzePricingPopover } from "./AnalyzePricingPopover";

vi.mock("@/components/ui/PricingPopover", () => ({
  PricingPopover: ({ eyebrow, rows }: PricingPopoverProps) => (
    <div>
      <span>{eyebrow}</span>
      {rows.map((row) => (
        <span key={row.label}>{row.value}</span>
      ))}
    </div>
  ),
}));

describe("AnalyzePricingPopover localization boundary", () => {
  it("passes injected provider-cost and rate-unit copy instead of UI-library defaults", () => {
    const messages = structuredClone(backlinksFeatureTestMessages);
    const pricing = messages.projectBacklinks.workspace.pricing;
    pricing.eyebrow = "Koszt dostawcy";
    pricing.perHundred = "{price} na 100";

    renderWithFeatureMessages(
      <AnalyzePricingPopover
        anchor={document.createElement("button")}
        onClose={vi.fn()}
        resultLimit={100}
        scope="site"
      />,
      { locale: "pl", messages },
    );

    expect(screen.getByText("Koszt dostawcy")).toBeInTheDocument();
    expect(screen.getByText(/na 100/)).toBeInTheDocument();
    expect(screen.getByText(/0,03\s+USD na 100/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
