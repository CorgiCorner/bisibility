import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { CompareView } from "@/lib/pages/compare-model";
import { defaultProjectPagesQuery } from "@/lib/pages/url-state";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PagesComparePanel } from "./PagesComparePanel";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

function frame(children: ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DateDisplayProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </DateDisplayProvider>
    </FeatureMessagesProvider>
  );
}

const today: CompareView = {
  annotationId: "sig_today",
  annotations: [{ dateKey: "2026-11-10", id: "sig_today", title: "Shipped the guide" }],
  changedTagId: "tag_changed",
  empty: null,
  metrics: [{ disabledReason: null, id: "clicks" }],
  result: {
    annotation: { dateKey: "2026-11-10", id: "sig_today", title: "Shipped the guide" },
    changed: { lowVolume: false, pageCount: 3, percent: null },
    day: 0,
    difference: { kind: "monitoring" },
    forecast: null,
    markers: [],
    moment: "2026-11-10",
    overlapPages: 0,
    phase: "monitoring",
    points: [],
    unchanged: { lowVolume: false, pageCount: 4, percent: null },
  },
  selectedMetric: "clicks",
  tags: [
    { id: "tag_changed", name: "Changed", pages: 3 },
    { id: "tag_control", name: "Control", pages: 4 },
  ],
  unchangedTagId: "tag_control",
};

describe("PagesComparePanel day zero", () => {
  it("explains that a change made today has no results yet", () => {
    render(
      frame(
        <PagesComparePanel
          compare={today}
          onQuery={() => undefined}
          projectId="prj_1"
          query={{ ...defaultProjectPagesQuery, tab: "compare" }}
        />,
      ),
    );

    expect(
      screen.getByText("The change was made today. Results start tomorrow."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Day 0 of 28/)).not.toBeInTheDocument();
    expect(screen.queryByText("Monitoring")).not.toBeInTheDocument();
    expect(screen.queryByText("Forecast is not available in this version")).not.toBeInTheDocument();
    expect(screen.getAllByText("Waiting").length).toBeGreaterThanOrEqual(4);
  });
});
