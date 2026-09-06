import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { appPath, asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HEADER_CONTEXT_LABEL, HeaderContextSlot } from "./HeaderContextSlot";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/mui-tooltip"));

const PROJECT = asProjectRef("prj_example");

const MARKETS: HeaderContextMarket[] = [
  {
    countryCode: "US",
    keywordCount: 12,
    languageCode: "en",
    name: "United States",
    ref: asMarketRef("pmkt_us"),
  },
];

function renderSlot(pathname: string, contexts: HeaderContextMarket[] = MARKETS) {
  setNavigationState({ pathname });
  return render(<HeaderContextSlot contexts={contexts} projectRef={PROJECT} />);
}

function slot() {
  return screen.queryByRole("group", { name: HEADER_CONTEXT_LABEL });
}

describe("HeaderContextSlot", () => {
  it("names itself for the axis and not for the market", () => {
    // An engine axis is coming, so nothing structural here may spell out "market".
    expect(HEADER_CONTEXT_LABEL).toBe("Change context");
  });

  it("renders the switcher and the hairline inside a market", () => {
    renderSlot(marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker"));

    const group = slot();
    expect(group).not.toBeNull();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to all markets" })).toBeInTheDocument();
    const hairline = group?.querySelector("[data-context-hairline]");
    expect(hairline).toHaveClass("h-5", "w-px");
  });

  it("renders no element and no hairline on a project-scoped page", () => {
    const { container } = renderSlot(appPath(PROJECT, "rank-tracker"));

    expect(slot()).toBeNull();
    expect(container.querySelector("[data-context-hairline]")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the account routes that mount the same shell", () => {
    // The account layout mounts this shell with no project market context at all, and the
    // three account routes must not grow a switcher because the header frame is shared.
    const { container } = renderSlot("/app/account/preferences");

    expect(slot()).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("states an engine context without offering a way out of it", () => {
    // The engine axis has a URL shape and no producer yet: the slot says where it is, and
    // there is nothing to go back to until something can create one.
    renderSlot(`${appPath(PROJECT)}/e/eng_one/rank-tracker`);

    expect(slot()).not.toBeNull();
    expect(screen.getByText("eng_one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to all markets" })).toBeNull();
  });

  it("renders nothing when no context list was threaded in", () => {
    const { container } = renderSlot(
      marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker"),
      [],
    );

    expect(container).toBeEmptyDOMElement();
  });
});
