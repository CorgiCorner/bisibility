import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMarketsSelector } from "./ProjectMarketsSelector";

const { addProjectMarkets } = vi.hoisted(() => ({
  addProjectMarkets: vi.fn(async () => ({ maxMarkets: 5, ok: true as const })),
}));

vi.mock("@/lib/actions/project-markets", () => ({ addProjectMarkets }));
vi.mock("@/components/markets/MarketPicker", () => ({
  MarketPicker: ({ onCommit }: { onCommit: (choices: unknown[]) => Promise<void> }) => (
    <button
      onClick={() =>
        void onCommit([
          {
            canonicalKey: "DE",
            countryCode: "DE",
            displayName: "Germany",
            kind: "country",
            language: { code: "de", label: "German" },
            researchAvailable: true,
          },
        ])
      }
      type="button"
    >
      Commit Germany
    </button>
  ),
}));

const markets = {
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 30,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "ES@en",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_es_en",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 30,
      researchAvailable: false,
      status: "active" as const,
    },
    {
      canonicalKey: "BE@ar",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pmkt_be_ar",
      languageCode: "ar",
      languageLabel: "Arabic",
      monthlyCostCents: 30,
      researchAvailable: false,
      status: "paused" as const,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 60,
  perMarketChecks: 2,
  projectId: "prj_1",
};

afterEach(() => {
  addProjectMarkets.mockClear();
});

function renderSelector(maxMarkets = markets.maxMarkets) {
  const onChange = vi.fn();
  render(
    <ProjectMarketsSelector
      defaultDevice="desktop"
      initialMarketKeys={["US"]}
      markets={{ ...markets, maxMarkets }}
      onChange={onChange}
      projectId="prj_1"
    />,
  );
  return onChange;
}

describe("ProjectMarketsSelector", () => {
  it("matches the settled market-chip anatomy without the retired helper copy", () => {
    renderSelector();

    const section = screen.getByRole("region", { name: "Markets" });
    expect(within(section).getByText("MARKETS")).toHaveStyle({ fontSize: "10px" });
    expect(
      within(section).queryByText("New keywords are created for every selected market and device."),
    ).not.toBeInTheDocument();

    const selected = within(section).getByRole("button", {
      name: "United States / English",
    });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveClass("rounded-full", "border-border", "bg-accent-soft", "text-fg");
    expect(selected.querySelector("svg")).not.toBeNull();

    const positionsOnly = within(section).getByRole("button", { name: "Spain / English" });
    expect(positionsOnly).toHaveAttribute("aria-pressed", "false");
    expect(positionsOnly).toHaveClass("rounded-full", "bg-bg-elev", "text-fg-muted");
    expect(within(positionsOnly).getByText("no volume/KD")).toHaveStyle({ fontSize: "10px" });

    const paused = within(section).getByRole("button", { name: "Belgium / Arabic" });
    expect(paused).toBeDisabled();
    expect(within(paused).getByText("PAUSED")).toHaveStyle({ fontSize: "9px" });
  });

  it("preserves market and device matrix selection", () => {
    const onChange = renderSelector();

    fireEvent.click(screen.getByRole("button", { name: "Spain / English" }));
    expect(onChange).toHaveBeenLastCalledWith({
      devices: ["desktop"],
      locationKeys: ["US", "ES@en"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(onChange).toHaveBeenLastCalledWith({
      devices: ["desktop", "mobile"],
      locationKeys: ["US", "ES@en"],
    });
  });

  it("adds a registry market and selects it in the same gesture", async () => {
    const onChange = renderSelector();

    fireEvent.click(screen.getByRole("button", { name: "New market" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Germany" }));

    await waitFor(() =>
      expect(addProjectMarkets).toHaveBeenCalledWith({
        choices: [
          {
            canonicalKey: "DE",
            countryCode: "DE",
            kind: "country",
            languageCode: "de",
          },
        ],
        projectId: "prj_1",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      devices: ["desktop"],
      locationKeys: ["US", "DE"],
    });
    expect(screen.getByRole("button", { name: "Germany / German" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the project market limit guard on the registry action", () => {
    renderSelector(3);

    const addMarket = screen.getByRole("button", { name: "New market" });
    expect(addMarket).toBeDisabled();
    fireEvent.click(addMarket);
    expect(screen.queryByRole("button", { name: "Commit Germany" })).not.toBeInTheDocument();
  });
});
