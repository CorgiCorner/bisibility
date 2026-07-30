import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchDetailPanel } from "./ResearchDetailPanel";

const mocks = vi.hoisted(() => ({ lineChart: vi.fn() }));

vi.mock("@mui/x-charts/LineChart", () => ({
  LineChart: (props: unknown) => {
    mocks.lineChart(props);
    return <div data-testid="line-chart" />;
  },
}));

const location = {
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  kind: "country" as const,
};

const costContext = {
  capCents: 5000,
  costPerCheckCents: 1,
  cronExpression: null,
  depth: 100 as const,
  deviceCount: 1,
  devices: ["desktop" as const],
  frequency: "daily" as const,
  keywordCount: 4,
  locationCount: 1,
  projectName: "Example",
  providerId: "dataforseo",
  rawFrequency: "daily" as const,
  spentCents: 100,
  timezone: "America/New_York",
};

function variant(keyword: string, searchVolume: number) {
  return {
    alreadySaved: false,
    alreadyTracked: false,
    competition: 0.71,
    cpcCents: 125,
    difficulty: 30,
    intent: "commercial" as const,
    keyword,
    monthlyTrend: [],
    searchVolume,
    source: "idea" as const,
  };
}

const active = {
  ...variant("seo tool", 500),
  variants: [variant("seo tool", 500), variant("seo-tool", 180)],
};

describe("ResearchDetailPanel", () => {
  it("uses the shared tracking configuration and forwards the selected values", () => {
    const onAdd = vi.fn();
    render(
      <ResearchDetailPanel
        active={active}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={onAdd}
        projectId="prj_1"
        seed="seo"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Mobile" }));
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent(
      "Project default, daily",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to tracking" }));

    expect(onAdd).toHaveBeenCalledWith({
      device: "mobile",
      keywords: ["seo tool"],
      location,
      scheduleFrequency: "project_default",
    });
  });

  it("shows the results eyebrow, decimal competition, grouped variants, and the priced cost line", () => {
    render(
      <ResearchDetailPanel
        active={active}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.getByText("From results")).toBeInTheDocument();
    expect(screen.getByText("0.71")).toBeInTheDocument();
    expect(screen.getByText("Variants, grouped")).toBeInTheDocument();
    expect(screen.getByText("seo-tool")).toBeInTheDocument();
    expect(
      screen.getByText("Variants share one Google volume unless clickstream volumes are on."),
    ).toBeInTheDocument();
    // Daily checks at 1 cent per check: the monthly price reads inline at normal weight.
    const price = screen.getByText("~$0.30");
    expect(price.tagName).toBe("SPAN");
    expect(price).not.toHaveClass("font-semibold");
    expect(
      screen.getByText(/\/month at project default, daily checks, billed to your own account\./),
    ).toBeInTheDocument();
  });

  it("shows tracking counts without money when the provider rate is unknown", () => {
    render(
      <ResearchDetailPanel
        active={active}
        costContext={{ ...costContext, costPerCheckCents: null, providerId: null }}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(
      screen.getByText("Tracking estimate: 1 keyword, 1 location, daily."),
    ).toBeInTheDocument();
  });

  it("keeps the Location and Schedule labels screen-reader only", () => {
    render(
      <ResearchDetailPanel
        active={active}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.getByText("Location").parentElement).toHaveClass("sr-only");
    expect(screen.getByText("Schedule")).toHaveClass("sr-only");
    // The controls stay reachable by their accessible names.
    expect(screen.getByRole("combobox", { name: "Location" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Location" })).toHaveAttribute(
      "id",
      "research-detail-tracking-location",
    );
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
  });

  it("keeps missing monthly values out of the chart scale", () => {
    render(
      <ResearchDetailPanel
        active={{
          ...active,
          monthlyTrend: [
            { month: 3, searchVolume: 40, year: 2026 },
            { month: 2, searchVolume: null, year: 2026 },
            { month: 1, searchVolume: 100, year: 2026 },
          ],
        }}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(mocks.lineChart).toHaveBeenCalledWith(
      expect.objectContaining({
        series: [
          expect.objectContaining({
            connectNulls: false,
            data: [100, null, 40],
          }),
        ],
        yAxis: [{ max: 110.00000000000001, min: 0, position: "none" }],
      }),
    );
  });

  it("offers the free secondary save action below tracking", () => {
    const onSave = vi.fn();
    render(
      <ResearchDetailPanel
        active={active}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        onSave={onSave}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.getByText("Free. No checks run until you track it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
    expect(onSave).toHaveBeenCalledWith(active);
  });

  it("replaces the save action with a Saved deep link and keeps tracked precedence", () => {
    const { rerender } = render(
      <ResearchDetailPanel
        active={{ ...active, alreadySaved: true }}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        onSave={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.queryByRole("button", { name: "Save for later" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saved / view in Keywords" })).toHaveAttribute(
      "href",
      `${appPath("prj_1", "keywords")}?tab=saved`,
    );

    rerender(
      <ResearchDetailPanel
        active={{ ...active, alreadySaved: true, alreadyTracked: true }}
        costContext={costContext}
        defaultTracking={{ device: "desktop", location, scheduleFrequency: "project_default" }}
        onAdd={vi.fn()}
        onSave={vi.fn()}
        projectId="prj_1"
        seed="seo"
      />,
    );

    expect(screen.getByText("Already tracked.")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Saved / view in Keywords" }),
    ).not.toBeInTheDocument();
  });
});
