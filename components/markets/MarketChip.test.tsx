import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketChip } from "./MarketChip";

describe("MarketChip", () => {
  it("renders the sm variant on one line with a pinned height", () => {
    render(<MarketChip languageLabel="Spanish" locationLabel="Spain" size="sm" />);

    const location = screen.getByText("Spain");
    const chip = location.parentElement;

    expect(chip).toHaveClass("h-[22px]", "text-xs", "whitespace-nowrap", "rounded-full");
    expect(location).toHaveClass("font-semibold", "text-fg");
    expect(screen.getByText("/ Spanish")).toHaveClass("text-fg-muted");
  });

  it("spends a narrow row on the location, never on the language", () => {
    render(
      <MarketChip
        className="max-w-[208px]"
        languageLabel="Portuguese"
        locationLabel="Sao Joaquim da Barra, Brazil"
      />,
    );

    // The language distinguishes same-geo pairs, so it must not be the half that
    // collapses first. The location ellipsizes instead of being clipped mid-glyph.
    const location = screen.getByText("Sao Joaquim da Barra, Brazil");
    const language = screen.getByText("/ Portuguese");

    expect(location).toHaveClass("truncate", "min-w-0", "shrink-[999]");
    // The language still ellipsizes as a last resort, so a label longer than the whole
    // budget loses its tail rather than being clipped mid-glyph.
    expect(language).toHaveClass("truncate", "min-w-0");
    expect(language).not.toHaveClass("shrink-[999]");
  });

  it("defaults to the sm variant and grows only for md", () => {
    const { rerender } = render(<MarketChip languageLabel="Dutch" locationLabel="Belgium" />);
    expect(screen.getByText("Belgium").parentElement).toHaveClass("h-[22px]");

    rerender(<MarketChip languageLabel="Dutch" locationLabel="Belgium" size="md" />);
    expect(screen.getByText("Belgium").parentElement).toHaveClass("h-6");
  });

  it("carries the device fact on the icon as label and title", () => {
    render(<MarketChip device="mobile" languageLabel="Arabic" locationLabel="Belgium" />);

    const icon = screen.getByLabelText("Mobile");
    expect(icon).toBeVisible();
    expect(icon.parentElement).toHaveAttribute("title", "Mobile");
  });

  it("omits the device icon when no device applies", () => {
    render(<MarketChip languageLabel="Spanish" locationLabel="Spain" />);

    expect(screen.queryByLabelText("Desktop")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mobile")).not.toBeInTheDocument();
  });
});
