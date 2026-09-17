import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-dashboard.json";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { OverviewToolbar } from "./OverviewToolbar";
import type { OverviewView } from "./types";

function renderToolbar(props: ComponentProps<typeof OverviewToolbar>) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <OverviewToolbar {...props} />
    </FeatureMessagesProvider>,
  );
}

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_1/dashboard" });
});

const selected = {
  availableTags: [],
  deviceValue: "all",
  marketOptions: [
    { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
    { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
  ],
  marketValues: [],
  rangeValue: "28d",
  tagValue: null,
} satisfies OverviewView["toolbar"];

describe("OverviewToolbar", () => {
  it("keeps read filters but hides keyword creation for a viewer", () => {
    renderToolbar({ canCreateKeyword: false, initialSelected: selected, projectRef: "prj_1" });
    expect(screen.queryByRole("link", { name: /Add keyword/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("Last 28 days");
  });
  it("uses the compact 37px primary action", () => {
    renderToolbar({ initialSelected: selected, projectRef: "prj_1" });

    const action = screen.getByRole("link", { name: /Add keyword/ });
    expect(action).toHaveStyle({ height: "37px", minHeight: "37px" });
  });

  it("keeps only period and tag filters in the toolbar", () => {
    renderToolbar({ initialSelected: selected, projectRef: "prj_1" });

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
    renderToolbar({
      initialSelected: {
        ...selected,
        availableTags: ["Docs"],
        tagValue: "Docs",
      },
      projectRef: "prj_1",
    });

    expect(screen.getByRole("button", { name: "Tag" })).toHaveTextContent("Docs");
  });

  it("leaves market selection to the top header", () => {
    renderToolbar({ initialSelected: selected, projectRef: "prj_1" });
    expect(screen.queryByRole("button", { name: "Markets" })).not.toBeInTheDocument();
  });

  it("never renders the refresh chip for any schedule mix", () => {
    renderToolbar({ initialSelected: selected, projectRef: "prj_1" });

    expect(screen.queryByText(/Refresh:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Refresh cadence/)).not.toBeInTheDocument();
  });
});
