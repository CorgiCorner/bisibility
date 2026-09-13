import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
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
  tag: "All tags",
  tagValue: null,
} satisfies OverviewView["toolbar"];

describe("OverviewToolbar", () => {
  it("keeps read filters but hides keyword creation for a viewer", () => {
    render(
      <OverviewToolbar canCreateKeyword={false} initialSelected={selected} projectRef="prj_1" />,
    );
    expect(screen.queryByRole("link", { name: /Add keyword/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("Last 28 days");
  });
  it("uses the compact 37px primary action", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    const action = screen.getByRole("link", { name: /Add keyword/ });
    expect(action).toHaveStyle({ height: "37px", minHeight: "37px" });
  });

  it("keeps only period and tag filters in the toolbar", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    const filters = [
      screen.getByRole("button", { name: "Date range" }),
      screen.getByRole("button", { name: "Tag" }),
    ];

    for (const filter of filters) {
      expect(filter).toHaveClass("overview-toolbar-filter");
    }
    expect(screen.queryByRole("button", { name: "All devices" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Tag" })).toHaveTextContent("Docs");
  });

  it("leaves market selection to the top header", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);
    expect(screen.queryByRole("button", { name: "Markets" })).not.toBeInTheDocument();
  });

  it("never renders the refresh chip for any schedule mix", () => {
    render(<OverviewToolbar initialSelected={selected} projectRef="prj_1" />);

    expect(screen.queryByText(/Refresh:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Refresh cadence/)).not.toBeInTheDocument();
  });
});
