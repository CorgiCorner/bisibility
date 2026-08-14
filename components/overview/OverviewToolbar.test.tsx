import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OverviewToolbar } from "./OverviewToolbar";
import type { OverviewView } from "./types";

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_1/dashboard" });
});

const selected = {
  availableTags: [],
  device: "All devices",
  deviceValue: "all",
  marketOptions: [
    { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
    { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
  ],
  marketValues: [],
  range: "Last 28 days",
  rangeValue: "28d",
  refresh: "Daily",
  tag: "All tags",
  tagValue: null,
} satisfies OverviewView["toolbar"];

describe("OverviewToolbar", () => {
  it("uses the compact 37px primary action", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    const action = screen.getByRole("link", { name: /Add keyword/ });
    expect(action).toHaveClass("MuiButton-sizeSmall");
    expect(action).toHaveStyle({ height: "37px", minHeight: "37px" });
  });

  it("uses one pill variant for every interactive toolbar filter", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    const filters = [
      screen.getByRole("button", { name: "Markets" }),
      screen.getByRole("button", { name: "Last 28 days" }),
      screen.getByRole("button", { name: "All devices" }),
      screen.getByRole("button", { name: "Tag: All tags" }),
    ];

    for (const filter of filters) {
      expect(filter).toHaveClass("overview-toolbar-filter");
    }
    expect(filters[0]).toHaveClass(
      "!rounded-full",
      "!bg-bg-elev",
      "!text-xs",
      "!font-semibold",
      "!text-fg-muted",
      "hover:!border-accent",
      "hover:!bg-bg-sunken",
      "hover:!text-accent",
    );
  });

  it("keeps a selected tag in the same neutral filter variant", () => {
    render(
      <OverviewToolbar
        initialSelected={{
          ...selected,
          availableTags: ["Docs"],
          tag: "Docs",
          tagValue: "Docs",
        }}
        projectRef="prj_1"
      />,
    );

    expect(screen.getByRole("button", { name: "Tag: Docs" })).toHaveStyle({
      backgroundColor: "var(--bg-elev)",
      color: "var(--fg-muted)",
    });
  });

  it("shows the registry-backed market selector and writes repeated market scope params", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    fireEvent.click(screen.getByRole("button", { name: "Markets" }));
    expect(screen.getByRole("menuitemradio", { name: "All markets" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Spain.*Spanish/ }));

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_1/dashboard?market=loc_es_es");

    fireEvent.click(screen.getByRole("menuitemradio", { name: "All markets" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/app/prj_1/dashboard");
  });

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
