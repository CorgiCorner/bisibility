import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ConversionReport } from "@/lib/conversions/surface";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInsightsConversionsCard } from "./SearchInsightsConversionsCard";

const report: ConversionReport = {
  current: 1,
  goalCount: 1,
  kind: "ready",
  pages: [{ conversions: 1, path: "/pricing", rate: 0.2, sessions: 5 }],
  previous: 0,
  selection: { connect: false, options: [], selected: "ga4", showSwitch: false },
  series: [],
  source: "ga4",
  sourceLabel: "GA4",
};

describe("search insights conversions card", () => {
  it("keeps page paths in sans and the pages link a compact footer button", () => {
    render(
      <FeatureMessagesProvider locale="en" messages={{ ...shared, ...messages }} timeZone="UTC">
        <SearchInsightsConversionsCard projectId="prj_story" report={report} />
      </FeatureMessagesProvider>,
    );
    const path = screen.getByText("/pricing");
    expect(path).toHaveClass("font-sans");
    expect(path).not.toHaveClass("font-mono");
    const link = screen.getByRole("link", { name: "Open in Pages" });
    expect(link.parentElement).toHaveClass("justify-end");
    expect(link).not.toHaveClass("w-full");
  });
});
