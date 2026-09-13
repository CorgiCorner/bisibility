import { MarketChips, type MarketChipsProps } from "@/components/markets/blocks/MarketChips";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const markets = [
  { id: "pmkt_es", label: "Spain / Spanish", researchAvailable: true, status: "active" },
  { id: "pmkt_be", label: "Belgium / Dutch", researchAvailable: false, status: "active" },
] as const;

function props(overrides: Partial<MarketChipsProps> = {}): MarketChipsProps {
  return {
    capability: "selection",
    markets,
    onChange: vi.fn(),
    selected: ["pmkt_es"],
    ...overrides,
  };
}

describe("MarketChips", () => {
  it("highlights selected markets like device chips and clears the highlight on deselection", () => {
    const { rerender } = render(<MarketChips {...props()} />);
    const market = screen.getByRole("button", { name: "Spain / Spanish" });
    expect(market).toHaveAttribute("aria-pressed", "true");
    expect(market).toHaveClass("bg-bg-sunken", "text-fg");
    rerender(<MarketChips {...props({ selected: [] })} />);
    expect(market).toHaveAttribute("aria-pressed", "false");
    expect(market).not.toHaveClass("bg-bg-sunken");
    expect(market).toHaveClass("bg-bg-elev", "text-fg-muted");
  });

  it("changes selection and renders the capability badge from research availability", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MarketChips {...props({ onChange })} />);

    await user.click(screen.getByRole("button", { name: "Belgium / Dutch" }));
    expect(onChange).toHaveBeenCalledWith(["pmkt_es", "pmkt_be"]);
    expect(screen.getByText("no volume/KD")).toBeVisible();
  });

  it("shows New market only for a permitted callback", () => {
    const { rerender } = render(<MarketChips {...props()} />);
    expect(screen.queryByRole("button", { name: "New market" })).not.toBeInTheDocument();

    rerender(<MarketChips {...props({ onNew: vi.fn() })} />);
    expect(screen.getByRole("button", { name: "New market" })).toBeVisible();
  });

  it("does not expose creation to a scoping fixture, even with an injected callback", () => {
    render(<MarketChips {...props({ capability: "scoping", onNew: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: "New market" })).not.toBeInTheDocument();
  });
});

it.each(["selection", "scoping"] as const)(
  "allows paused markets for %s and omits archived markets",
  async (capability) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketChips
        {...props({
          capability,
          onChange,
          selected: [],
          markets: [
            { ...markets[0], status: "paused" },
            { ...markets[1], status: "removed" },
          ],
        })}
      />,
    );
    const paused = screen.getByRole("button", { name: "Spain / Spanish" });
    expect(paused).toBeEnabled();
    expect(paused).toHaveTextContent("PAUSED");
    expect(screen.queryByRole("button", { name: "Belgium / Dutch" })).not.toBeInTheDocument();
    await user.click(paused);
    expect(onChange).toHaveBeenCalledWith(["pmkt_es"]);
  },
);
