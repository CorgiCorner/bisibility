import { appPath, asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import {
  type HeaderContextMarket,
  headerContextState,
  MARKET_SEARCH_THRESHOLD,
  marketKeywordLabel,
  marketPairLabel,
  marketRows,
  marketSearchVisible,
  marketSwitchDestination,
} from "./header-context";

const PROJECT = asProjectRef("prj_example");

function market(ref: string, name: string, keywordCount: number): HeaderContextMarket {
  return {
    countryCode: name === "Spain" ? "ES" : "US",
    keywordCount,
    languageCode: name === "Spain" ? "es" : "en",
    name,
    ref: asMarketRef(ref),
  };
}

const MARKETS = [market("pmkt_us", "United States", 12), market("pmkt_es", "Spain", 0)];

describe("header context state", () => {
  it("names the market the URL carries", () => {
    const state = headerContextState(
      marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker"),
      MARKETS,
    );

    expect(state).toEqual({ kind: "market", market: MARKETS[0] });
  });

  it("has no context on a project-scoped page", () => {
    expect(headerContextState(appPath(PROJECT, "settings"), MARKETS)).toEqual({ kind: "none" });
    expect(headerContextState(appPath(PROJECT), MARKETS)).toEqual({ kind: "none" });
  });

  it("has no context on the account routes that mount the same shell", () => {
    // The account layout mounts the shell without any project market context at all, so the
    // slot has to answer "nothing" even when a market list was threaded in.
    expect(headerContextState("/app/account", MARKETS)).toEqual({ kind: "none" });
    expect(headerContextState("/app/account/preferences", MARKETS)).toEqual({ kind: "none" });
  });

  it("shows a placeholder for the engine axis, which has no producer yet", () => {
    expect(headerContextState(`${appPath(PROJECT)}/e/eng_one/rank-tracker`, MARKETS)).toEqual({
      kind: "placeholder",
      label: "eng_one",
    });
  });

  it("refuses to name a market that is not in the list", () => {
    // A nameless trigger is worse than none: the route layer already 404s or redirects an
    // unknown market, so reaching here means the threaded list is stale.
    expect(
      headerContextState(marketPath(PROJECT, asMarketRef("pmkt_gone"), "rank-tracker"), MARKETS),
    ).toEqual({ kind: "none" });
  });
});

describe("market row copy", () => {
  it("pairs the country and the language in the codes the URL already uses", () => {
    expect(marketPairLabel({ countryCode: "us", languageCode: "EN" })).toBe("US-en");
  });

  it("counts keywords, and says empty rather than zero", () => {
    expect(marketKeywordLabel(12)).toBe("12 kw");
    expect(marketKeywordLabel(1)).toBe("1 kw");
    expect(marketKeywordLabel(0)).toBe("empty");
  });

  it("builds one row per market, in registry order", () => {
    expect(marketRows(MARKETS, "")).toEqual([
      { countLabel: "12 kw", name: "United States", pair: "US-en", value: "pmkt_us" },
      { countLabel: "empty", name: "Spain", pair: "ES-es", value: "pmkt_es" },
    ]);
  });

  it("filters on the name and on the pair", () => {
    expect(marketRows(MARKETS, "spa").map((row) => row.value)).toEqual(["pmkt_es"]);
    expect(marketRows(MARKETS, "US-en").map((row) => row.value)).toEqual(["pmkt_us"]);
    expect(marketRows(MARKETS, "  ").map((row) => row.value)).toEqual(["pmkt_us", "pmkt_es"]);
    expect(marketRows(MARKETS, "nothing")).toEqual([]);
  });
});

describe("market search threshold", () => {
  it("appears past six markets and not at six", () => {
    expect(MARKET_SEARCH_THRESHOLD).toBe(6);
    expect(marketSearchVisible(MARKET_SEARCH_THRESHOLD)).toBe(false);
    expect(marketSearchVisible(MARKET_SEARCH_THRESHOLD + 1)).toBe(true);
    expect(marketSearchVisible(0)).toBe(false);
  });
});

describe("market switch destination", () => {
  it("keeps the reader on the same page, one market over", () => {
    expect(
      marketSwitchDestination({
        marketRef: asMarketRef("pmkt_es"),
        pathname: marketPath(PROJECT, asMarketRef("pmkt_us"), "rank-tracker"),
        projectRef: PROJECT,
      }),
    ).toBe(marketPath(PROJECT, asMarketRef("pmkt_es"), "rank-tracker"));
  });

  it("drops to the project route for a section with no market route", () => {
    // Routed through the one gated builder, so the switcher cannot mint a market URL whose
    // only handler is the catch-all that redirects it straight back.
    expect(
      marketSwitchDestination({
        marketRef: asMarketRef("pmkt_es"),
        pathname: marketPath(PROJECT, asMarketRef("pmkt_us"), "competitors"),
        projectRef: PROJECT,
      }),
    ).toBe(appPath(PROJECT, "competitors"));
  });
});
