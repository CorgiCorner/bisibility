import { readFileSync } from "node:fs";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import enShared from "@/messages/core/en/shared.json";
import plShared from "@/messages/core/pl/shared.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChartMarkerLegend, ChartMarkerPinBody, ChartMarkerTooltipList } from "./ChartMarkerLegend";
import {
  chartMarkerPreferenceKey,
  resetChartMarkerPreferenceStores,
} from "./chart-marker-preference";

describe("chart marker locale", () => {
  it("renders a generated marker in the tooltip and legend for a non-English locale", () => {
    render(
      <FeatureMessagesProvider locale="pl" messages={plShared} timeZone="UTC">
        <>
          <ChartMarkerLegend
            markers={[
              {
                dateKey: "2026-11-03",
                id: "sig_sitemap",
                kind: "sitemap",
                title: "Map",
              },
            ]}
          />
          <ChartMarkerTooltipList
            markers={[
              {
                added: 2,
                dateKey: "2026-11-03",
                generated: "sitemapTitle",
                id: "sig_sitemap",
                kind: "sitemap",
                removed: 1,
                title: "",
              },
              { dateKey: "2026-11-03", id: "sig_note", kind: "note", title: "FAQ added" },
            ]}
          />
        </>
      </FeatureMessagesProvider>,
    );

    expect(screen.getByText("Mapa witryny: dodano 2, usunięto 1")).toBeInTheDocument();
    expect(screen.getByText("FAQ added")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mapa witryny/ })).toBeInTheDocument();
    expect(screen.queryByText(/Sitemap:/)).not.toBeInTheDocument();
  });

  it("uses a markers switch, a ghost annotations action, and no underlined link", () => {
    resetChartMarkerPreferenceStores();
    localStorage.removeItem(chartMarkerPreferenceKey("prj_1"));
    render(
      <FeatureMessagesProvider locale="en" messages={enShared} timeZone="UTC">
        <ChartMarkerLegend
          markers={[{ dateKey: "2026-11-01", id: "note", kind: "note", title: "FAQ" }]}
          projectRef="prj_1"
        />
      </FeatureMessagesProvider>,
    );
    expect(screen.getByRole("switch", { name: "Markers" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Note/ })).toHaveAttribute("aria-pressed", "true");
    const link = screen.getByRole("link", { name: "Open Annotations" });
    expect(link).toHaveAttribute("data-variant", "ghost");
    expect(link).toHaveAttribute("data-size", "xs");
    expect(link).toHaveAttribute("href", expect.stringContaining("/annotations"));
    expect(link).not.toHaveClass("underline");
    expect(
      screen.getByRole("button", { name: "Markers come from Annotations." }),
    ).toBeInTheDocument();
  });

  it("turns one kind off and collapses every chip when markers are off", async () => {
    const user = userEvent.setup();
    render(
      <FeatureMessagesProvider locale="en" messages={enShared} timeZone="UTC">
        <ChartMarkerLegend
          markers={[
            { dateKey: "2026-11-01", id: "note", kind: "note", title: "FAQ" },
            { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Ship" },
          ]}
        />
      </FeatureMessagesProvider>,
    );

    const deploy = screen.getByRole("button", { name: /Deploy/ });
    await user.click(deploy);
    expect(deploy).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Note/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("switch", { name: "Markers" }));
    expect(screen.queryByRole("button", { name: /Deploy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Note/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Markers come from Annotations." }),
    ).toBeInTheDocument();
  });
});

describe("chart legend placement", () => {
  it.each([
    "components/overview/PositionTrendCard.tsx",
    "components/search-insights/SearchInsightsClicksChart.tsx",
    "components/pages/PagesCompareChart.tsx",
    "components/pages/PagesExistingPanel.tsx",
  ])("renders the one legend after the plot in %s", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source.indexOf("<ChartMarkerLegend")).toBeGreaterThan(
      source.indexOf("<TimeSeriesChart"),
    );
    expect(source.match(/<ChartMarkerLegend/g)).toHaveLength(1);
    expect(source).not.toContain("flex flex-wrap gap-3 text-ui-caption");
  });
});

it.each([1, 2])("uses compact linked entries in a %i-entry pin card", (count) => {
  const markers = Array.from({ length: count }, (_, i) => ({
    dateKey: "2026-11-01",
    id: `entry-${i}`,
    kind: "note" as const,
    source: "production",
    title: `Entry ${i}`,
  }));
  const { container } = render(
    <FeatureMessagesProvider locale="en" messages={enShared} timeZone="UTC">
      <ChartMarkerPinBody
        date="Nov 1, 2026"
        pin={{ count, dateKey: "2026-11-01", index: 0, kind: "note", letter: "N", markers }}
        projectRef="prj_test"
      />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText(count === 1 ? "Nov 1, 2026" : "Nov 1, 2026 · 2 annotations")).toHaveClass(
    "text-fg-muted",
  );
  expect(screen.getByRole("link", { name: "Entry 0" })).toHaveAttribute(
    "href",
    "/app/prj_test/annotations?q=entry-0",
  );
  for (const badge of container.querySelectorAll("[data-annotation-badge]")) {
    expect(badge).toHaveClass("size-4");
    expect(badge.parentElement).toHaveClass("h-lh", "items-center");
    expect(badge.closest("[data-annotation-entry]")).toHaveClass(
      "gap-2",
      "items-start",
      "text-ui-caption",
    );
  }
  for (const source of screen.getAllByText("Note · production"))
    expect(source).toHaveClass("text-fg-muted");
});
