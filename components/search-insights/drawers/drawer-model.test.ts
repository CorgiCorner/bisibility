import type { AppLocale } from "@/i18n/config";
import { DRAWER_LIST_CAP, POSITION_BAND } from "@/lib/search-insights/constants";
import messages from "@/messages/core/en/project-search-insights.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  drawerBackLabel,
  drawerBars,
  drawerFrameKey,
  drawerGoogleSearchHref,
  drawerKicker,
  drawerListEmptyCopy,
  drawerMeasuredZeroLine,
  drawerPagePivotEmptyCopy,
  drawerPivotHeading,
  drawerShowAllLabel,
  drawerShowAllTitle,
  drawerStatCards,
  drawerTitle,
  drawerWindowLabel,
  type SearchInsightsDrawerPresentation,
} from "./drawer-model";
import {
  storyBandList,
  storyOverlapList,
  storyPageDetail,
  storyQueryDetail,
} from "./drawer-story-fixtures";

const counts = { band: 33, overlap: 5 };
const intlLocales: Record<AppLocale, string> = {
  en: "en-US",
  "es-ES": "es-ES",
  ja: "ja-JP",
  pl: "pl-PL",
};

function presentation(
  copy: typeof messages.projectSearchInsights.copy = messages.projectSearchInsights.copy,
  locale: AppLocale = "en",
): SearchInsightsDrawerPresentation {
  return {
    formatNumber: (value, options) =>
      new Intl.NumberFormat(intlLocales[locale], options).format(value),
    t: createTranslator({ locale, messages: copy }),
  };
}

const english = presentation();

describe("frame identity", () => {
  it("keys a frame by what it opens, so the visited dot survives a reorder", () => {
    expect(drawerFrameKey({ kind: "query", query: "stored query" })).toBe("query:stored query");
    expect(drawerFrameKey({ kind: "page", path: "/guide", url: "https://example.com/guide" })).toBe(
      "page:https://example.com/guide",
    );
    expect(drawerFrameKey({ kind: "list", which: "band" })).toBe("list:band");
  });

  it("derives the keys used by page and query rows from the same frame identity", () => {
    const page = { kind: "page", path: "/guide", url: "https://example.com/guide" } as const;
    const query = { kind: "query", query: "stored query" } as const;

    expect(drawerFrameKey(page)).toBe("page:https://example.com/guide");
    expect(drawerFrameKey(query)).toBe("query:stored query");
  });

  it("names the band by its positions rather than by jargon", () => {
    expect(drawerBackLabel({ kind: "list", which: "band" }, english)).toBe(
      `Positions ${POSITION_BAND.min} to ${POSITION_BAND.max}`,
    );
    expect(drawerBackLabel({ kind: "list", which: "overlap" }, english)).toBe("Page overlap");
    expect(drawerBackLabel({ kind: "query", query: "stored query" }, english)).toBe("stored query");
    expect(
      drawerKicker({ kind: "page", path: "/guide", url: "https://example.com/guide" }, english),
    ).toBe("Page");
  });
});

describe("drawerGoogleSearchHref", () => {
  it.each([
    ["rank tracking software", "https://www.google.com/search?q=rank+tracking+software"],
    ["corgi & seo/2026?", "https://www.google.com/search?q=corgi+%26+seo%2F2026%3F"],
  ])("builds an exact Google query URL for %s", (query, expected) => {
    const href = drawerGoogleSearchHref(query);
    const url = new URL(href);

    expect(href).toBe(expected);
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.searchParams.get("q")).toBe(query);
    expect(url.searchParams.has("gl")).toBe(false);
    expect(url.searchParams.has("hl")).toBe(false);
  });
});

describe("drawerTitle", () => {
  it("titles a list from the chip until its own total arrives", () => {
    const frame = { kind: "list", which: "band" } as const;

    expect(drawerTitle(frame, { status: "loading" }, counts, english)).toBe(
      "33 queries ranking below the top three",
    );
    expect(
      drawerTitle(
        frame,
        { content: { kind: "band", list: storyBandList }, status: "ready" },
        counts,
        english,
      ),
    ).toBe("33 queries ranking below the top three");
  });

  it("titles the overlap list by what it counts", () => {
    expect(drawerTitle({ kind: "list", which: "overlap" }, undefined, counts, english)).toBe(
      "5 queries answered by more than one page",
    );
  });

  it("titles a detail frame with the row it opened", () => {
    expect(drawerTitle({ kind: "query", query: "stored query" }, undefined, counts, english)).toBe(
      "stored query",
    );
    expect(
      drawerTitle(
        { kind: "page", path: "/guide", url: "https://example.com/guide" },
        undefined,
        counts,
        english,
      ),
    ).toBe("/guide");
  });
});

describe("drawerListEmptyCopy", () => {
  it.each([
    [
      "band",
      0,
      "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      "This list tracks queries where demand exists but rank can improve.",
    ],
    [
      "band",
      12,
      "None of your named queries sit at positions 4 to 20 - everything Google names ranks in the top three.",
      "This list tracks queries where demand exists but rank can improve.",
    ],
    [
      "overlap",
      0,
      "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      "This list tracks queries where more than one of your pages appears.",
    ],
    [
      "overlap",
      12,
      "No query is answered by more than one page in this window - no overlap signal.",
      "This list tracks queries where more than one of your pages appears.",
    ],
  ] as const)(
    "describes %s with %i named queries truthfully",
    (kind, namedQueryCount, copy, definition) => {
      expect(drawerListEmptyCopy(kind, namedQueryCount, english)).toEqual({ copy, definition });
    },
  );
});

describe("drawerPivotHeading", () => {
  it("says a query is one of the overlaps only when more than one page ranks for it", () => {
    const many = drawerPivotHeading({ detail: storyQueryDetail, kind: "query" }, english);

    expect(many.title).toBe("Your pages competing for it");
    expect(many.count).toBe("2 pages");
    expect(many.note).toContain("one of the overlaps counted above");

    const one = drawerPivotHeading(
      {
        detail: {
          ...storyQueryDetail,
          pages: { rows: [storyQueryDetail.pages.rows[0]], total: 1 },
        },
        kind: "query",
      },
      english,
    );

    expect(one.title).toBe("Your page ranking for it");
    expect(one.count).toBe("1 page");
    expect(one.note).toBeNull();
  });

  it("counts a list only while it is shorter than what it counts", () => {
    expect(drawerPivotHeading({ kind: "overlap", list: storyOverlapList }, english).count).toBe(
      "2 of 5",
    );
    expect(
      drawerPivotHeading(
        {
          kind: "band",
          list: { rows: storyBandList.rows, total: storyBandList.rows.length },
        },
        english,
      ).count,
    ).toBeNull();
  });

  it("counts the pages a query drawer shows, never a total it truncated", () => {
    const heading = drawerPivotHeading(
      {
        detail: { ...storyQueryDetail, pages: { rows: storyQueryDetail.pages.rows, total: 34 } },
        kind: "query",
      },
      english,
    );

    expect(heading.count).toBe("2 of 34");
    expect(heading.title).toBe("Your pages competing for it");
  });

  it("counts a page's queries against what the window holds", () => {
    const heading = drawerPivotHeading({ detail: storyPageDetail, kind: "page" }, english);

    expect(heading.title).toBe("Queries landing here");
    expect(heading.count).toBe("3 of 12");
  });

  it("omits the count for an empty page pivot", () => {
    const heading = drawerPivotHeading(
      { detail: { ...storyPageDetail, queries: { rows: [], total: 0 } }, kind: "page" },
      english,
    );

    expect(heading.count).toBeNull();
  });
});

describe("bars and stats", () => {
  it("draws one bar per day of the window, scaled to its busiest day", () => {
    const bars = drawerBars(
      [
        { clicks: 0, date: "2026-07-06" },
        { clicks: 5, date: "2026-07-07" },
        { clicks: 10, date: "2026-07-08" },
      ],
      english,
    );

    expect(bars.map((bar) => bar.height)).toEqual([2, 50, 100]);
    expect(bars[2].title).toBe("10 clicks");
    expect(drawerWindowLabel(1, english)).toBe("1 finalized day");
    expect(drawerWindowLabel(28, english)).toBe("28 finalized days");
  });

  it("keeps the zero baseline when only one day of the window has clicks", () => {
    const bars = drawerBars(
      [
        { clicks: 0, date: "2026-07-01" },
        { clicks: 1, date: "2026-07-02" },
        { clicks: 0, date: "2026-07-03" },
        { clicks: 0, date: "2026-07-04" },
        { clicks: 0, date: "2026-07-05" },
        { clicks: 0, date: "2026-07-06" },
      ],
      english,
    );

    expect(bars.map((bar) => bar.height)).toEqual([2, 100, 2, 2, 2, 2]);
    expect(bars.filter((bar) => bar.title === "0 clicks")).toHaveLength(5);
  });

  it("draws a visible zero baseline without changing semantic values", () => {
    const bars = drawerBars(
      [
        { clicks: 0, date: "2026-07-06" },
        { clicks: 0, date: "2026-07-07" },
      ],
      english,
    );

    expect(bars.map((bar) => bar.height)).toEqual([2, 2]);
    expect(bars.map((bar) => bar.title)).toEqual(["0 clicks", "0 clicks"]);
    expect(drawerMeasuredZeroLine(7, english)).toBe(
      "No clicks on any of these 7 days. The impressions above are views without a click.",
    );
    expect(drawerMeasuredZeroLine(1, english)).toBe(
      "No clicks on this 1 day. The impressions above are views without a click.",
    );
  });

  it("reads the four numbers the design puts above the bars", () => {
    expect(drawerStatCards(storyQueryDetail.stats, english)).toEqual([
      { label: "Clicks", value: "310" },
      { label: "Impr", value: "7,560" },
      { label: "CTR", value: "4.1%" },
      { label: "Avg pos", value: "5.4" },
    ]);
  });

  it("explains measured impressions without named page queries", () => {
    expect(
      drawerPagePivotEmptyCopy(
        {
          ...storyPageDetail,
          queries: { rows: [], total: 0 },
          stats: { clicks: 0, ctr: 0, impressions: 44, position: 8.3 },
        },
        english,
      ),
    ).toBe(
      "No named queries for this page. Google hides low-volume query text for privacy - all 44 impressions came from queries it does not name.",
    );
    expect(
      drawerPagePivotEmptyCopy(
        {
          ...storyPageDetail,
          queries: { rows: [], total: 0 },
          stats: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
        },
        english,
      ),
    ).toBe("No named queries for this page in the selected period.");
    expect(
      drawerPagePivotEmptyCopy(
        {
          ...storyPageDetail,
          queries: { rows: [], total: 0 },
          stats: { clicks: 0, ctr: 0, impressions: 1, position: 8.3 },
        },
        english,
      ),
    ).toContain("the 1 impression came from");
  });
});

describe("drawerShowAllLabel", () => {
  it("offers the rest only while there is a rest to offer", () => {
    expect(drawerShowAllLabel({ rows: storyBandList.rows, total: 33 }, english)).toBe(
      "Show all 33",
    );
    expect(drawerShowAllLabel({ rows: storyBandList.rows, total: 3 }, english)).toBeNull();
    expect(drawerShowAllTitle({ rows: storyBandList.rows, total: 33 }, english)).toBe(
      "All rows come from your stored data, so expanding costs nothing at the provider.",
    );
  });

  it("promises only what one click may build when the list runs past the cap", () => {
    const saturated = { rows: storyBandList.rows, total: DRAWER_LIST_CAP * 3 };

    expect(drawerShowAllLabel(saturated, english)).toBe("Show top 1,000");
    expect(drawerShowAllLabel(saturated, english)).not.toContain("all");
    expect(drawerShowAllTitle(saturated, english)).toBe(
      "This list holds more rows than one panel can carry, so the busiest 1,000 open here.",
    );
  });

  it("stops offering once the list already holds every row the cap reaches", () => {
    const rows = Array.from({ length: DRAWER_LIST_CAP }, () => storyBandList.rows[0]);

    expect(drawerShowAllLabel({ rows, total: DRAWER_LIST_CAP * 3 }, english)).toBeNull();
  });
});

describe("localized drawer presentation", () => {
  it("uses the supplied catalog and formatter instead of English model literals", () => {
    const localized = presentation(
      {
        ...messages.projectSearchInsights.copy,
        drawerClickCount: "{count, number} clics localizados",
        drawerListTitleBand: "{count, number} consultas por mejorar",
        drawerNoClicksMany: "Sin clics durante {days, number} dias.",
      },
      "pl",
    );

    expect(drawerTitle({ kind: "list", which: "band" }, undefined, counts, localized)).toBe(
      "33 consultas por mejorar",
    );
    expect(drawerBars([{ clicks: 1_234, date: "2026-07-06" }], localized)[0]?.title).toBe(
      "1234 clics localizados",
    );
    expect(drawerMeasuredZeroLine(7, localized)).toBe("Sin clics durante 7 dias.");
  });
});
