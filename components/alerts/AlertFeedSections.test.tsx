import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { TriggeredAlertFeedView } from "@/lib/alerts/alert-data";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnreadSummary } from "./AlertFeedSections";

const alerts: TriggeredAlertFeedView[] = [
  {
    afterPosition: 12,
    beforePosition: 4,
    condition: {
      changePct: null,
      competitorDomain: null,
      dropPositions: 8,
      serpFeature: null,
      thresholdPosition: null,
      topN: null,
    },
    conditionType: "position_drop",
    deliveryAttempts: [],
    deliveryState: "delivered",
    firedAt: new Date().toISOString(),
    id: "al_abcdefghijklmnopqrstuvwx",
    keyword: "rank tracker",
    device: "desktop",
    rule: "Slipped",
    severity: "urgent",
    unread: true,
  },
  {
    afterPosition: 5,
    beforePosition: 7,
    condition: {
      changePct: null,
      competitorDomain: null,
      dropPositions: 2,
      serpFeature: null,
      thresholdPosition: null,
      topN: null,
    },
    conditionType: "position_drop",
    deliveryAttempts: [],
    deliveryState: "delivered",
    firedAt: new Date().toISOString(),
    id: "al_bcdefghijklmnopqrstuvwxy",
    keyword: "keyword research",
    device: "mobile",
    rule: "Improved",
    severity: "warning",
    unread: true,
  },
  {
    afterPosition: 3,
    beforePosition: 5,
    condition: {
      changePct: null,
      competitorDomain: null,
      dropPositions: 2,
      serpFeature: null,
      thresholdPosition: null,
      topN: null,
    },
    conditionType: "position_drop",
    deliveryAttempts: [],
    deliveryState: "delivered",
    firedAt: new Date().toISOString(),
    id: "al_cdefghijklmnopqrstuvwxyz",
    keyword: "rank monitoring",
    device: "desktop",
    rule: "Updated",
    severity: "info",
    unread: true,
  },
];

describe("UnreadSummary", () => {
  it("uses simple color dots for severity legend entries", () => {
    render(<UnreadSummary alerts={alerts} readIds={new Set()} />);

    const summary = screen.getByText("Unread alerts").parentElement;
    expect(summary).not.toBeNull();
    expect(summary?.querySelectorAll("svg")).toHaveLength(0);

    for (const label of ["Urgent", "Warning", "Info"]) {
      const legendEntry = screen.getByText(label).parentElement;
      const dot = legendEntry?.firstElementChild;

      expect(dot).toHaveClass("h-[7px]", "w-[7px]", "rounded-full");
      expect(dot).not.toHaveClass("rounded-control");
    }
  });
});
