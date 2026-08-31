import type { TriggeredAlertView } from "@/lib/alerts/alert-data";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnreadSummary } from "./AlertFeedSections";

const alerts: TriggeredAlertView[] = [
  {
    action: "Investigate the change.",
    ctas: [],
    current: "#12",
    deliveryAttempts: [],
    deliveryState: "delivered",
    headline: "Ranking dropped",
    id: "al_abcdefghijklmnopqrstuvwx",
    keyword: "rank tracker",
    location: "United States",
    device: "desktop",
    previous: "#4",
    rule: "Slipped",
    severity: "urgent",
    unread: true,
    when: "5m ago",
  },
  {
    action: "Investigate the change.",
    ctas: [],
    current: "#5",
    deliveryAttempts: [],
    deliveryState: "delivered",
    headline: "Ranking changed",
    id: "al_bcdefghijklmnopqrstuvwxy",
    keyword: "keyword research",
    location: "United Kingdom",
    device: "mobile",
    previous: "#7",
    rule: "Improved",
    severity: "warning",
    unread: true,
    when: "8m ago",
  },
  {
    action: "Investigate the change.",
    ctas: [],
    current: "#3",
    deliveryAttempts: [],
    deliveryState: "delivered",
    headline: "Ranking updated",
    id: "al_cdefghijklmnopqrstuvwxyz",
    keyword: "rank monitoring",
    location: "Germany",
    device: "desktop",
    previous: "#5",
    rule: "Updated",
    severity: "info",
    unread: true,
    when: "11m ago",
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
