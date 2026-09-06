import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsGa4PropertyPicker } from "./SearchInsightsGa4PropertyPicker";

const setup = {
  properties: [
    {
      kind: "ga4" as const,
      label: "Store (123456789)",
      permissionLevel: "Account",
      value: "123456789",
    },
  ],
  provider: "ga4" as const,
};

describe("SearchInsightsGa4PropertyPicker", () => {
  it("lays out a full-width two-column card with a hairline footer", async () => {
    render(
      <SearchInsightsGa4PropertyPicker
        cancelling={false}
        manualEntry={false}
        onCancel={vi.fn()}
        onManualEntryChange={vi.fn()}
        onPropertyChange={vi.fn()}
        onPropertyErrorChange={vi.fn()}
        onSelect={vi.fn()}
        pending={false}
        property="123456789"
        propertyError={null}
        setup={setup}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Connect Google Analytics 4" });
    expect(heading).toHaveClass("text-ui-body");
    expect(heading.closest(".p-4")).toHaveClass("md:grid-cols-2");
    const mark = screen.getByRole("img", { name: "Google logo" });
    expect(mark).toHaveClass("h-10", "w-10");
    const promise = screen.getByText(/Read-only\./);
    const trigger = screen.getByRole("button", { name: "Google Analytics property" });
    expect(trigger).toHaveAttribute("aria-describedby", promise.id);
    expect(screen.getByText("Property")).toBeVisible();
    const footer = screen.getByRole("button", { name: "Not now" }).parentElement;
    expect(footer).toHaveClass("justify-end", "border-t", "border-border", "px-4");
  });

  it("opens manual entry from the text link without rendering the drawer idle button", async () => {
    const onManualEntryChange = vi.fn();
    const onPropertyChange = vi.fn();
    const onPropertyErrorChange = vi.fn();
    render(
      <SearchInsightsGa4PropertyPicker
        cancelling={false}
        manualEntry={false}
        onCancel={vi.fn()}
        onManualEntryChange={onManualEntryChange}
        onPropertyChange={onPropertyChange}
        onPropertyErrorChange={onPropertyErrorChange}
        onSelect={vi.fn()}
        pending={false}
        property="123456789"
        propertyError={null}
        setup={setup}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "I don't see my property" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enter a property ID manually" }));
    expect(onManualEntryChange).toHaveBeenCalledWith(true);
    expect(onPropertyChange).toHaveBeenCalledWith("");
    expect(onPropertyErrorChange).toHaveBeenCalledWith(null);
  });

  it("returns to discovered properties from manual entry", async () => {
    const onManualEntryChange = vi.fn();
    const onPropertyChange = vi.fn();
    const onPropertyErrorChange = vi.fn();
    render(
      <SearchInsightsGa4PropertyPicker
        cancelling={false}
        manualEntry
        onCancel={vi.fn()}
        onManualEntryChange={onManualEntryChange}
        onPropertyChange={onPropertyChange}
        onPropertyErrorChange={onPropertyErrorChange}
        onSelect={vi.fn()}
        pending={false}
        property=""
        propertyError={null}
        setup={setup}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Google Analytics property" }),
    ).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Choose from discovered properties" });
    expect(back).toHaveClass("text-fg", "hover:underline", "-ms-2", "px-2", "gap-1");
    expect(back).not.toHaveClass("underline", "text-fg-muted");
    const backArrow = back.querySelector("svg");
    expect(backArrow).toHaveAttribute("aria-hidden", "true");
    expect(backArrow).toHaveAttribute("width", "12");
    const propertyGuide = screen.getByRole("link", { name: "Property ID guide" });
    const measurementGuide = screen.getByRole("link", { name: "Measurement ID guide" });
    expect(propertyGuide).toHaveClass("hover:underline");
    expect(propertyGuide).not.toHaveClass("underline");
    expect(propertyGuide.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(measurementGuide).toHaveClass("hover:underline");
    expect(measurementGuide).not.toHaveClass("underline");
    expect(measurementGuide.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(back);
    expect(onManualEntryChange).toHaveBeenCalledWith(false);
    expect(onPropertyChange).toHaveBeenCalledWith("123456789");
    expect(onPropertyErrorChange).toHaveBeenCalledWith(null);
  });

  it("does not offer a list return when discovery found nothing", () => {
    render(
      <SearchInsightsGa4PropertyPicker
        cancelling={false}
        manualEntry
        onCancel={vi.fn()}
        onManualEntryChange={vi.fn()}
        onPropertyChange={vi.fn()}
        onPropertyErrorChange={vi.fn()}
        onSelect={vi.fn()}
        pending={false}
        property=""
        propertyError={null}
        setup={{
          error: "Couldn't load your GA4 properties. Try again.",
          properties: [],
          provider: "ga4",
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Choose from discovered properties" }),
    ).not.toBeInTheDocument();
  });
});
