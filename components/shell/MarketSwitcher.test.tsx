import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { MARKET_SEARCH_THRESHOLD } from "@/lib/markets/header-context";
import { appPath, asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketSwitcher } from "./MarketSwitcher";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

// jsdom has no layout and therefore no `scrollIntoView` at all. Standing one up is what lets a
// test see whether the list actually follows the active row; without it the switcher would
// simply throw the moment an arrow key is pressed.
const scrollIntoView = vi.fn();
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: scrollIntoView,
  writable: true,
});

beforeEach(() => {
  scrollIntoView.mockClear();
});

const PROJECT = asProjectRef("prj_example");
const RANK_TRACKER = marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker");

function market(
  ref: string,
  name: string,
  countryCode: string,
  languageCode: string,
  keywordCount: number,
): HeaderContextMarket {
  return { countryCode, keywordCount, languageCode, name, ref: asMarketRef(ref) };
}

const MARKETS = [
  market("pmkt_us", "United States", "US", "en", 12),
  market("pmkt_es", "Spain", "ES", "es", 0),
];

function manyMarkets(count: number): HeaderContextMarket[] {
  return Array.from({ length: count }, (_, index) =>
    market(`pmkt_${index}`, `Market ${index}`, "US", "en", index),
  );
}

function renderSwitcher(markets = MARKETS, pathname = RANK_TRACKER) {
  return render(
    <MarketSwitcher
      market={markets[0]}
      markets={markets}
      pathname={pathname}
      projectRef={PROJECT}
    />,
  );
}

function trigger() {
  return screen.getByRole("button", { name: "United States" });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
  return screen.getByRole("dialog", { name: "Switch market" });
}

function partsOf(option: HTMLElement) {
  return {
    count: option.querySelector("[data-market-count]")?.textContent,
    name: option.querySelector("[data-market-name]")?.textContent,
    pair: option.querySelector("[data-market-pair]")?.textContent,
  };
}

describe("MarketSwitcher trigger", () => {
  it("names the market, caps it at 240px and keeps the whole string in a tooltip", () => {
    renderSwitcher();

    const button = trigger();
    expect(button).toHaveClass("h-8");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveClass(
      "border-transparent",
      "bg-transparent",
      "hover:border-transparent",
      "hover:bg-bg-sunken",
      "active:bg-bg-inset",
      "focus-visible:outline-accent-solid",
    );
    expect(button.querySelector("[data-market-name]")).toHaveClass("sm:max-w-[240px]", "truncate");
    expect(button.querySelector("[data-context-switcher-caret]")).toBeInTheDocument();
    expect(button.closest("[data-tooltip]")).toHaveAttribute("data-tooltip", "United States");
  });

  it("leaves the market through All markets in the selector", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await openMenu(user);
    await user.click(screen.getByRole("option", { name: /All markets/ }));
    expect(routerMock.push).toHaveBeenCalledWith(appPath(PROJECT, "rank-tracker"));
  });
});

describe("MarketSwitcher menu", () => {
  it("orders the rows, states the count and marks the market being read", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    const options = within(dialog).getAllByRole("option");

    expect(partsOf(options[0])).toEqual({ count: "2", name: "All markets", pair: undefined });
    expect(partsOf(options[1])).toEqual({ count: "12 kw", name: "United States", pair: "US-en" });
    expect(partsOf(options[2])).toEqual({ count: "empty", name: "Spain", pair: "ES-es" });
    expect(options).toHaveLength(3);
    expect(options[1].querySelector('[data-country-flag="US"]')).toBeInTheDocument();
    expect(options[2].querySelector('[data-country-flag="ES"]')).toBeInTheDocument();
    expect(options[0].querySelector("[data-country-flag]")).toBeNull();
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  it("separates the two groups with full-bleed rules", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    const rules = dialog.querySelectorAll("[data-market-rule]");
    const list = within(dialog).getByRole("listbox", { name: "Markets" });

    expect(rules).toHaveLength(2);
    expect(rules[0]).toHaveClass("-mx-1.5", "h-px");
    expect(rules[1]).toHaveClass("-mx-1.5", "h-px");
    // The first rule parts the escape hatch from the markets, the second parts the markets from
    // the action, which is why one is inside the list and one is not.
    expect(list).toContainElement(rules[0] as HTMLElement);
    expect(list).not.toContainElement(rules[1] as HTMLElement);
    // A scrolling box computes `overflow-x` to `auto`, never `visible`, so the rule inside the
    // list cannot reach the edges by overflowing it - it would be cut off exactly where the
    // padding starts. The list carries that padding itself, which moves its clipping edge out
    // to the dialog's own, and the shared `-mx-1.5` then means the same thing in both places.
    expect(dialog).toHaveClass("p-1.5");
    expect(list).toHaveClass("-mx-1.5", "px-1.5", "overflow-y-auto");
  });

  it("keeps the creating action a button and never an option", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    const add = within(dialog).getByRole("button", { name: "Add market" });
    const list = within(dialog).getByRole("listbox", { name: "Markets" });

    expect(list).not.toContainElement(add);
    for (const option of within(dialog).getAllByRole("option")) {
      expect(within(option).queryByRole("button")).toBeNull();
    }
  });

  it("sends Add market to the single page-owned market sheet", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("button", { name: "Add market" }));

    expect(routerMock.push).toHaveBeenCalledWith(`${appPath(PROJECT, "markets")}?new-market=1`);
  });

  it("grows a search field past six markets and not at six", async () => {
    const user = userEvent.setup();
    const six = renderSwitcher(manyMarkets(MARKET_SEARCH_THRESHOLD));

    await user.click(screen.getByRole("button", { name: "Market 0" }));
    expect(screen.queryByRole("searchbox", { name: "Find market" })).toBeNull();
    six.unmount();

    renderSwitcher(manyMarkets(MARKET_SEARCH_THRESHOLD + 1));
    await user.click(screen.getByRole("button", { name: "Market 0" }));

    expect(screen.getByRole("searchbox", { name: "Find market" })).toBeInTheDocument();
  });

  it("narrows the list without hiding the way out of the market", async () => {
    const user = userEvent.setup();
    renderSwitcher(manyMarkets(MARKET_SEARCH_THRESHOLD + 1));

    await user.click(screen.getByRole("button", { name: "Market 0" }));
    await user.type(screen.getByRole("searchbox", { name: "Find market" }), "Market 3");

    const options = screen.getAllByRole("option");
    expect(options.map((option) => partsOf(option).name)).toEqual(["All markets", "Market 3"]);
  });
});

describe("MarketSwitcher keyboard", () => {
  it("reaches the search, the list and the action in that order", async () => {
    const user = userEvent.setup();
    renderSwitcher(manyMarkets(MARKET_SEARCH_THRESHOLD + 1));

    await user.click(screen.getByRole("button", { name: "Market 0" }));

    await user.tab();
    expect(screen.getByRole("searchbox", { name: "Find market" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("listbox", { name: "Markets" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Add market" })).toHaveFocus();
  });

  it("moves the active row with the arrows and commits it with Enter", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    const list = within(dialog).getByRole("listbox", { name: "Markets" });
    const options = within(dialog).getAllByRole("option");

    list.focus();
    expect(list).toHaveAttribute("aria-activedescendant", options[1].id);

    await user.keyboard("{ArrowDown}");
    expect(list).toHaveAttribute("aria-activedescendant", options[2].id);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(list).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{Enter}");
    expect(routerMock.push).toHaveBeenCalledWith(appPath(PROJECT, "rank-tracker"));
  });

  it("keeps the row the arrows move to on screen", async () => {
    const user = userEvent.setup();
    // Long enough that the list scrolls: a highlight moved by `aria-activedescendant` alone
    // walks off the bottom and the reader loses their place.
    renderSwitcher(manyMarkets(MARKET_SEARCH_THRESHOLD + 20));

    await user.click(screen.getByRole("button", { name: "Market 0" }));
    const list = screen.getByRole("listbox", { name: "Markets" });
    const options = screen.getAllByRole("option");
    list.focus();
    scrollIntoView.mockClear();

    await user.keyboard("{ArrowDown}");

    expect(list).toHaveAttribute("aria-activedescendant", options[2].id);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(options[2]);
    // `nearest` and nothing else: a row already in view must not drag the list around under a
    // reader who can see it perfectly well.
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });

    await user.keyboard("{End}");

    const last = options[options.length - 1];
    expect(list).toHaveAttribute("aria-activedescendant", last.id);
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(last);
  });

  it("switches to the market Enter lands on, on the same page", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const dialog = await openMenu(user);
    within(dialog).getByRole("listbox", { name: "Markets" }).focus();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(routerMock.push).toHaveBeenCalledWith(
      marketPath(PROJECT, asMarketRef("pmkt_es"), "rank-tracker"),
    );
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await openMenu(user);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the reader clicks away", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await openMenu(user);
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

it("offers the only paused market from All markets and shows its location and name", async () => {
  const user = userEvent.setup();
  const paused = {
    ...MARKETS[0],
    name: "US launch",
    description: "United States / English",
    status: "paused" as const,
  };
  render(
    <MarketSwitcher
      markets={[paused]}
      pathname={appPath(PROJECT, "rank-tracker")}
      projectRef={PROJECT}
    />,
  );
  await user.click(screen.getByRole("button", { name: "All markets" }));
  expect(screen.getByRole("option", { name: /All markets/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const option = screen.getByRole("option", { name: /US launch/ });
  expect(option).toHaveTextContent("United States / English");
  expect(option).toHaveTextContent("Paused");
  await user.click(option);
  expect(routerMock.push).toHaveBeenCalledWith(RANK_TRACKER);
});
it("explains an empty registry and opens the standard New market flow", async () => {
  const user = userEvent.setup();
  render(
    <MarketSwitcher
      markets={[]}
      pathname={appPath(PROJECT, "rank-tracker")}
      projectRef={PROJECT}
    />,
  );
  await user.click(screen.getByRole("button", { name: "No markets" }));
  expect(screen.getByText(/Add your first market to choose/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add market" }));
  expect(routerMock.push).toHaveBeenCalledWith(`${appPath(PROJECT, "markets")}?new-market=1`);
});

it("supports a keyword menu without project navigation, including an empty search", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  const markets = manyMarkets(MARKET_SEARCH_THRESHOLD + 1);
  render(
    <MarketSwitcher
      market={markets[0]}
      markets={markets}
      onAddMarket={null}
      onSelectMarket={select}
      pathname={appPath(PROJECT, "rank-tracker", "kw_example")}
      projectRef={PROJECT}
      showAllMarkets={false}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Market 0" }));
  expect(screen.queryByRole("option", { name: /All markets/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add market" })).toBeNull();
  const list = screen.getByRole("listbox", { name: "Markets" });
  list.focus();
  await user.keyboard("{Home}{ArrowDown}{Enter}");
  expect(select).toHaveBeenCalledWith(markets[1].ref);
  await user.click(screen.getByRole("button", { name: "Market 0" }));
  await user.type(screen.getByRole("searchbox", { name: "Find market" }), "missing market");
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(screen.getByText("No market matches that.")).toBeVisible();
  screen.getByRole("listbox", { name: "Markets" }).focus();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(select).toHaveBeenCalledOnce();
});
