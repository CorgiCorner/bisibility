import { asMarketRef, asProjectRef } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import { MARKET_ROUTE_SECTIONS } from "./market-route-sections";
import {
  archivedMarketDestination,
  archivedMarketNoteRef,
  legacyMarketDestination,
  marketScopeCorrection,
  resolvedContextDestination,
} from "./market-routes";

const PROJECT = asProjectRef(`prj_${"a".repeat(24)}`);
const MARKET = asMarketRef(`pmkt_${"c".repeat(24)}`);

describe("archivedMarketNoteRef", () => {
  it("reads a market id the query carried", () => {
    expect(archivedMarketNoteRef(MARKET)).toBe(MARKET);
    expect(archivedMarketNoteRef([MARKET, `pmkt_${"d".repeat(24)}`])).toBe(MARKET);
  });

  it("refuses anything that is not a market publicId, because the note echoes it back", () => {
    expect(archivedMarketNoteRef(undefined)).toBeNull();
    expect(archivedMarketNoteRef("")).toBeNull();
    expect(archivedMarketNoteRef("loc_frankfurt")).toBeNull();
    expect(archivedMarketNoteRef("prj_notamarket00000000000")).toBeNull();
    expect(archivedMarketNoteRef("<img src=x onerror=alert(1)>")).toBeNull();
  });
});

describe("archivedMarketDestination", () => {
  it("lands on the markets route carrying the note", () => {
    expect(archivedMarketDestination(PROJECT, MARKET)).toBe(
      `/app/${PROJECT}/markets?archived-market=${MARKET}`,
    );
  });
});

describe("resolvedContextDestination", () => {
  it("resolves to the market route when a market of this project is remembered", () => {
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        section: ["rank-tracker"],
      }),
    ).toBe(`/app/${PROJECT}/m/${MARKET}/rank-tracker`);
  });

  it("drops to the project route when nothing resolvable is remembered", () => {
    expect(
      resolvedContextDestination({
        marketRef: null,
        projectRef: PROJECT,
        section: ["rank-tracker"],
      }),
    ).toBe(`/app/${PROJECT}/rank-tracker`);
  });

  it("promotes exactly the sections the market route layer implements", () => {
    // Derived from the source of truth: a section added there without a route, or a route added
    // without the section, is caught by market-route-sections.test.ts.
    for (const section of MARKET_ROUTE_SECTIONS) {
      expect(
        resolvedContextDestination({
          marketRef: MARKET,
          projectRef: PROJECT,
          section: section.split("/").filter(Boolean),
        }),
      ).toBe(`/app/${PROJECT}/m/${MARKET}${section}`);
    }
  });

  it("drops a market-scopable page that has no market route yet to the project route", () => {
    // The defect this list exists for: with a last-market cookie set, every one of these was
    // promoted to a market URL whose only handler is the catch-all.
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        section: ["competitors"],
      }),
    ).toBe(`/app/${PROJECT}/competitors`);
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        section: ["dashboard"],
      }),
    ).toBe(`/app/${PROJECT}/dashboard`);
    // The section head is routed; this exact page is not.
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        section: ["rank-tracker", "kw_1"],
      }),
    ).toBe(`/app/${PROJECT}/rank-tracker/kw_1`);
  });

  it("drops a project-scoped page to the project route whatever is remembered", () => {
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        section: ["settings", "tracking"],
      }),
    ).toBe(`/app/${PROJECT}/settings/tracking`);
    expect(
      resolvedContextDestination({ marketRef: MARKET, projectRef: PROJECT, section: ["alerts"] }),
    ).toBe(`/app/${PROJECT}/alerts`);
  });

  it("drops the bare context to the project root", () => {
    expect(
      resolvedContextDestination({ marketRef: MARKET, projectRef: PROJECT, section: [] }),
    ).toBe(`/app/${PROJECT}`);
  });

  it("carries the query through unchanged", () => {
    expect(
      resolvedContextDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        search: new URLSearchParams({ tab: "saved" }),
        section: ["rank-tracker"],
      }),
    ).toBe(`/app/${PROJECT}/m/${MARKET}/rank-tracker?tab=saved`);
  });
});

describe("marketScopeCorrection", () => {
  it("moves a project-scoped page out of the market segment", () => {
    expect(marketScopeCorrection({ projectRef: PROJECT, section: ["settings", "tracking"] })).toBe(
      `/app/${PROJECT}/settings/tracking`,
    );
    expect(marketScopeCorrection({ projectRef: PROJECT, section: ["alerts"] })).toBe(
      `/app/${PROJECT}/alerts`,
    );
  });

  it("sends a market-scopable page with no market route to the project level, not to a 404", () => {
    expect(marketScopeCorrection({ projectRef: PROJECT, section: ["competitors"] })).toBe(
      `/app/${PROJECT}/competitors`,
    );
    expect(marketScopeCorrection({ projectRef: PROJECT, section: ["rank-tracker", "kw_1"] })).toBe(
      `/app/${PROJECT}/rank-tracker/kw_1`,
    );
    // Whether the page exists at all is the project route's answer to give, not this layer's.
    expect(marketScopeCorrection({ projectRef: PROJECT, section: ["not-a-page"] })).toBe(
      `/app/${PROJECT}/not-a-page`,
    );
  });

  it("keeps the query on the corrected URL", () => {
    expect(
      marketScopeCorrection({
        projectRef: PROJECT,
        search: new URLSearchParams({ tab: "audit" }),
        section: ["settings"],
      }),
    ).toBe(`/app/${PROJECT}/settings?tab=audit`);
  });
});

describe("legacyMarketDestination", () => {
  it("promotes the legacy lens to the market level and drops the param", () => {
    expect(
      legacyMarketDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        search: new URLSearchParams({ market: "loc_frankfurt", tab: "saved" }),
      }),
    ).toBe(`/app/${PROJECT}/m/${MARKET}/rank-tracker?tab=saved`);
  });

  it("drops a param this project cannot resolve rather than leaving a silent filter", () => {
    expect(
      legacyMarketDestination({
        marketRef: null,
        projectRef: PROJECT,
        search: new URLSearchParams({ market: "loc_gone" }),
      }),
    ).toBe(`/app/${PROJECT}/rank-tracker`);
  });

  it("does nothing when there is no legacy param", () => {
    expect(
      legacyMarketDestination({
        marketRef: MARKET,
        projectRef: PROJECT,
        search: new URLSearchParams({ tab: "saved" }),
      }),
    ).toBeNull();
  });
});
