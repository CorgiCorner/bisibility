import { hasMarketRoute, MARKET_ROUTE_SECTIONS } from "@/lib/markets/market-route-sections";
import { navItems } from "@/lib/nav/nav-items";
import { appSectionPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { describe, expect, it, vi } from "vitest";
import { commandGroups, filterGroups, type PaletteMarket } from "./command-palette-groups";

const malaga: PaletteMarket = { label: "Malaga core", ref: "pmkt_malagacore000000000000" };
const lisbon: PaletteMarket = { label: "Lisbon core", ref: "pmkt_lisboncore000000000000" };

function marketsGroup(markets: readonly PaletteMarket[], push = vi.fn()) {
  return commandGroups("prj_1", push, vi.fn(), [], markets).find(
    (group) => group.title === "Markets",
  );
}

describe("commandGroups", () => {
  it("omits disabled experimental navigation while preserving Markets rows", () => {
    const disabled = commandGroups("prj_1", vi.fn(), vi.fn(), [], [malaga]);
    const enabled = commandGroups("prj_1", vi.fn(), vi.fn(), [], [malaga], undefined, [
      "timeline",
      "competitors",
    ]);
    const disabledNavigate = disabled.find((group) => group.title === "Navigate");
    const enabledNavigate = enabled.find((group) => group.title === "Navigate");
    const disabledMarkets = disabled.find((group) => group.title === "Markets");
    const enabledMarkets = enabled.find((group) => group.title === "Markets");

    expect(disabledNavigate?.items.map((item) => item.label)).not.toContain("Timeline");
    expect(disabledNavigate?.items.map((item) => item.label)).not.toContain("Competitors");
    expect(enabledNavigate?.items.map((item) => item.label)).toContain("Competitors");
    expect(enabledNavigate?.items.map((item) => item.label)).not.toContain("Timeline");
    expect(enabledMarkets?.items.map((item) => item.label)).toEqual(
      disabledMarkets?.items.map((item) => item.label),
    );
    expect(
      disabledMarkets?.items.find((item) => item.label.startsWith("Rank Tracker")),
    ).toBeDefined();
  });

  it("opens external docs without routing through Next", () => {
    const push = vi.fn();
    const setMode = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    const navigate = commandGroups("prj_1", push, setMode, []).find(
      (group) => group.title === "Navigate",
    );
    const docs = navigate?.items.find((item) => item.label === "Docs and self-hosting");

    expect(docs).toBeDefined();
    docs?.run();

    expect(open).toHaveBeenCalledWith(DOCS_URL, "_blank", "noopener,noreferrer");
    expect(push).not.toHaveBeenCalledWith(DOCS_URL);

    open.mockRestore();
  });

  it("includes the keyword research workspace navigation command", () => {
    const push = vi.fn();
    const navigate = commandGroups("prj_1", push, vi.fn(), []).find(
      (group) => group.title === "Navigate",
    );

    navigate?.items.find((item) => item.label === "Keyword Research")?.run();

    expect(push).toHaveBeenCalledWith("/app/prj_1/keyword-research");
  });

  it("keeps routed Navigate rows in the current market and unrouted rows at project level", () => {
    const push = vi.fn();
    const navigate = commandGroups(
      "prj_1",
      push,
      vi.fn(),
      [],
      [],
      { marketSegments: ["m", "pmkt_current"] },
      ["competitors"],
    ).find((group) => group.title === "Navigate");

    navigate?.items.find((item) => item.label === "Rank Tracker")?.run();
    expect(push).toHaveBeenLastCalledWith("/app/prj_1/m/pmkt_current/rank-tracker");

    navigate?.items.find((item) => item.label === "Competitors")?.run();
    expect(push).toHaveBeenLastCalledWith("/app/prj_1/competitors");
  });

  it("includes Install in the Navigate group", () => {
    const push = vi.fn();
    const navigate = commandGroups("prj_1", push, vi.fn(), []).find(
      (group) => group.title === "Navigate",
    );
    const install = navigate?.items.find((item) => item.label === "Install");

    expect(install).toBeDefined();
    install?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/install");
  });

  it("has exact rank tracker labels with concrete hints", () => {
    const actions = commandGroups("prj_1", vi.fn(), vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const labels = actions?.items.map((i) => i.label);
    expect(labels).toContain("Rank Tracker: Add keyword");
    expect(labels).toContain("Rank Tracker: Import CSV");
    expect(labels).toContain("Rank Tracker: Export keywords");

    for (const item of actions?.items ?? []) {
      if (item.label.startsWith("Rank Tracker:")) {
        expect(item.hint).not.toBe("Action");
        expect(item.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not include Filter, Run rank checks, or generic Action hints", () => {
    const actions = commandGroups("prj_1", vi.fn(), vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const labels = actions?.items.map((i) => i.label);
    expect(labels).not.toContain("Filter");
    expect(labels).not.toContain("Run rank checks");

    const hints = actions?.items.map((i) => i.hint);
    expect(hints).not.toContain("Action");
  });

  it("pushes exact action hrefs for Add, Import, and Export", () => {
    const push = vi.fn();
    const actions = commandGroups("prj_1", push, vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const add = actions?.items.find((i) => i.label === "Rank Tracker: Add keyword");
    add?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=add");

    const imp = actions?.items.find((i) => i.label === "Rank Tracker: Import CSV");
    imp?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=import");

    const exp = actions?.items.find((i) => i.label === "Rank Tracker: Export keywords");
    exp?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=export");
  });
});

describe("commandGroups markets", () => {
  it("puts the Markets group above Navigate", () => {
    const titles = commandGroups("prj_1", vi.fn(), vi.fn(), [], [malaga]).map(
      (group) => group.title,
    );

    expect(titles).toContain("Markets");
    expect(titles.indexOf("Markets")).toBeLessThan(titles.indexOf("Navigate"));
  });

  it("names the page and the market, and navigates to that page under that market", () => {
    const push = vi.fn();
    const row = marketsGroup([malaga], push)?.items.find(
      (item) => item.label === "Rank Tracker in Malaga core",
    );

    expect(row).toBeDefined();
    row?.run();

    expect(push).toHaveBeenCalledWith(`/app/prj_1/m/${malaga.ref}/rank-tracker`);
  });

  it("keeps each market's rows together, in the order the markets arrive", () => {
    const labels = marketsGroup([malaga, lisbon])?.items.map((item) => item.label) ?? [];
    const lastMalaga = labels.map((label) => label.endsWith(malaga.label)).lastIndexOf(true);
    const firstLisbon = labels.findIndex((label) => label.endsWith(lisbon.label));

    expect(lastMalaga).toBeGreaterThanOrEqual(0);
    expect(firstLisbon).toBeGreaterThan(lastMalaga);
  });

  it("offers only the sections that have a market route", () => {
    const push = vi.fn();
    const items = marketsGroup([malaga], push)?.items ?? [];
    const sections = items.map((item) => {
      push.mockClear();
      item.run();
      return appSectionPath(String(push.mock.calls[0]?.[0]));
    });

    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(hasMarketRoute(section)).toBe(true);
    }
    expect([...new Set(sections)].sort()).toEqual([...MARKET_ROUTE_SECTIONS].sort());

    // The absent half is derived from the same pair as the offered half - the nav model split
    // by the market-route gate - so a section that gains a market route later moves across on
    // its own instead of failing here on a page name written down by hand. Today that half is
    // Dashboard and every other rail row: they follow the reader's level or their own axis, and
    // the market layer serves none of them, so offering one would be a straight 404.
    const labels = items.map((item) => item.label);
    const unrouted = navItems("prj_1").filter((item) => !hasMarketRoute(appSectionPath(item.href)));

    expect(unrouted.length).toBeGreaterThan(0);
    for (const item of unrouted) {
      expect(labels).not.toContain(`${item.label} in ${malaga.label}`);
    }
  });

  it("finds a market row by the page name or by the market name", () => {
    const groups = commandGroups("prj_1", vi.fn(), vi.fn(), [], [malaga]);

    for (const query of ["rank tracker", "malaga"]) {
      const markets = filterGroups(groups, query).find((group) => group.title === "Markets");
      expect(markets?.items.map((item) => item.label)).toContain("Rank Tracker in Malaga core");
    }
  });

  it("leaves the palette exactly as it is when the project has no markets", () => {
    const withoutMarkets = commandGroups("prj_1", vi.fn(), vi.fn(), []).map((group) => group.title);
    const emptyMarkets = commandGroups("prj_1", vi.fn(), vi.fn(), [], []).map(
      (group) => group.title,
    );

    expect(withoutMarkets).toEqual(["Navigate", "Keywords", "Actions"]);
    expect(emptyMarkets).toEqual(["Navigate", "Keywords", "Actions"]);
  });
});
