import { MARKETING_URL } from "@/lib/site/site";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrackedMarketsContent } from "./TrackedMarketsContent";

vi.mock("@/components/markets/MarketPicker", () => ({
  MarketPicker: () => <div data-market-picker-test="" />,
}));
vi.mock("@/components/settings/developers/DeveloperActionsMenu", () => ({
  DeveloperActionsMenu: ({ items }: { items: { label: string; onSelect: () => void }[] }) => (
    <button onClick={items[0]?.onSelect} type="button">
      {items[0]?.label}
    </button>
  ),
}));

const view = {
  markets: [
    {
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_spain",
      languageLabel: "Spanish",
      languageCode: "es",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "BE@ar",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pmkt_belgium",
      languageLabel: "Arabic",
      languageCode: "ar",
      monthlyCostCents: 1100,
      researchAvailable: false,
      status: "paused" as const,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 1100,
  perMarketChecks: 24,
  projectId: "prj_abcdefghijklmnopqrstuvwx",
};
const firstMarket = view.markets[0];
if (!firstMarket) throw new Error("Tracked market fixture is missing its first row.");

function renderContent(
  overrides: Partial<React.ComponentProps<typeof TrackedMarketsContent>> = {},
) {
  return render(
    <TrackedMarketsContent
      addMarkets={vi.fn()}
      canEdit
      canRemove
      markets={view}
      removeMarket={vi.fn()}
      setMarketEnabled={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TrackedMarketsContent", () => {
  it("opens Add market in a drawer instead of docking the picker in the card", () => {
    renderContent();

    expect(
      screen.queryByText("Pick a location, then the languages to track there."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add market" }));
    expect(screen.getByRole("heading", { name: "Add market" })).toBeVisible();
    expect(screen.getByText("Pick a location, then the languages to track there.")).toBeVisible();
    expect(
      document.querySelector("[data-tracked-markets-card] [data-market-picker-test]"),
    ).toBeNull();
  });

  it("renders location-language pairs, paused state, and muted availability metadata", () => {
    renderContent();

    expect(screen.getByText("Spain / Spanish")).toBeVisible();
    expect(screen.getByText("Belgium / Arabic")).toBeVisible();
    expect(screen.getByText("no volume/KD")).toBeVisible();
    expect(screen.getByText("Paused")).toBeVisible();
  });

  it("shows explicit history-preservation copy before removal", () => {
    renderContent();
    const remove = screen.getAllByRole("button", { name: "Remove market" }).at(1);
    if (!remove) throw new Error("Belgium removal control is missing.");
    fireEvent.click(remove);

    expect(screen.getByRole("dialog", { name: "Remove Belgium / Arabic?" })).toHaveTextContent(
      "Collected history stays visible on keyword pages and in Checks.",
    );
  });

  it("pauses without opening a confirmation modal", async () => {
    const setMarketEnabled = vi.fn();
    renderContent({ setMarketEnabled });
    fireEvent.click(screen.getByRole("switch", { name: "Pause Spain / Spanish" }));

    await waitFor(() =>
      expect(setMarketEnabled).toHaveBeenCalledWith({
        enabled: false,
        marketId: "pmkt_spain",
        projectId: view.projectId,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables adding at the shared cap", () => {
    renderContent({
      markets: {
        ...view,
        markets: [...view.markets, ...view.markets, firstMarket].slice(0, 5),
      },
    });

    expect(screen.getByRole("button", { name: "Add market" })).toBeDisabled();
  });

  it("links the calculator through the shared external link with safe target and rel", () => {
    renderContent();

    const link = screen.getByRole("link", { name: /Estimate provider cost/ });
    expect(link).toHaveAttribute("href", `${MARKETING_URL}/rank-tracking-cost-calculator`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
