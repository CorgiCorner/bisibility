import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OverviewToolbar } from "./OverviewToolbar";
import type { OverviewView } from "./types";

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_1/overview" });
});

const selected = {
  availableTags: [],
  device: "All devices",
  deviceValue: "all",
  range: "Last 28 days",
  rangeValue: "28d",
  refresh: "Daily",
  tag: "All tags",
  tagValue: null,
} satisfies OverviewView["toolbar"];

describe("OverviewToolbar", () => {
  it("hides the refresh chip when the selection has mixed schedules", () => {
    render(
      <OverviewToolbar
        initialSelected={{ ...selected, refresh: "Mixed schedules" }}
        projectRef="prj_1"
      />,
    );

    expect(screen.queryByText(/Refresh:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Refresh cadence/)).not.toBeInTheDocument();
  });

  it("keeps the refresh chip when the selection has one schedule", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    expect(screen.getByText("Refresh: Daily")).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh cadence Daily")).toBeInTheDocument();
  });
});
