import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { appPath, asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HEADER_CONTEXT_LABEL, HeaderContextSlot } from "./HeaderContextSlot";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

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

  it("renders one context control inside a market", () => {
    renderSlot(marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker"));

    const group = slot();
    expect(group).not.toBeNull();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to all markets" })).not.toBeInTheDocument();
  });

  it("renders no element and no hairline on a project-scoped page", () => {
    const { container } = renderSlot(appPath(PROJECT, "settings"));

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

it.each([0, 1, 3])(
  "keeps market context available at project level with %i markets",
  async (count) => {
    renderSlot(
      appPath(PROJECT, "rank-tracker"),
      Array.from({ length: count }, (_, i) => ({ ...MARKETS[0], ref: asMarketRef(`pmkt_${i}`) })),
    );
    expect(
      screen.getByRole("button", { name: count ? "All markets" : "No markets" }),
    ).toBeInTheDocument();
  },
);
