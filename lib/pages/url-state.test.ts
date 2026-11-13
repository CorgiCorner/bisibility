import { dateKey } from "@/lib/search-insights/dates";
import { describe, expect, it } from "vitest";
import { projectPagesPeriod } from "./period";
import {
  defaultProjectPagesQuery,
  fillProjectPagesCompareQuery,
  parseProjectPagesQuery,
  projectPagesHref,
  projectPagesSearchParams,
} from "./url-state";

describe("project pages URL state", () => {
  it("reads a shareable view and drops unknown values", () => {
    expect(
      parseProjectPagesQuery({
        dir: "asc",
        index: "indexed",
        page: "2",
        period: "7",
        q: " /docs ",
        sitemap: "not_listed",
        sort: "position",
        source: "sitemap",
        tab: "compare",
      }),
    ).toEqual({
      dir: "asc",
      index: "indexed",
      page: 2,
      period: "7",
      search: "/docs",
      sitemap: "not_listed",
      sort: "position",
      source: "sitemap",
      span: "since",
      tab: "compare",
    });
    expect(parseProjectPagesQuery({ period: "1", sort: "tags" })).toEqual(defaultProjectPagesQuery);
    expect(parseProjectPagesQuery({ tab: "by-tag", tag: "tag_docs" })).toMatchObject({
      tab: "by-tag",
      tag: "tag_docs",
    });
    expect(parseProjectPagesQuery({ tag: "bad tag" }).tag).toBeUndefined();
    expect(
      projectPagesSearchParams({ ...defaultProjectPagesQuery, tag: "tag_docs" }).get("tag"),
    ).toBe("tag_docs");
  });

  it("keeps an index group and an exact Google coverage reason in the shareable URL", () => {
    const reason = "Crawled - currently not indexed";
    const query = parseProjectPagesQuery({ coverage: `  ${reason}  `, index: "not_indexed" });
    expect(query.index).toBe("not_indexed");
    expect(query.coverage).toBe(reason);
    expect(projectPagesHref("prj_1", { ...defaultProjectPagesQuery, ...query })).toBe(
      `/app/prj_1/pages?index=not_indexed&coverage=${encodeURIComponent(reason).replaceAll("%20", "+")}`,
    );
    expect(
      parseProjectPagesQuery({ coverage: "bad\u0000reason", index: "nope" }).coverage,
    ).toBeUndefined();
    expect(parseProjectPagesQuery({ index: "nope" }).index).toBeUndefined();
  });

  it("omits default parameters from the shareable URL", () => {
    expect(projectPagesHref("prj_1", defaultProjectPagesQuery)).toBe("/app/prj_1/pages");
    const query = parseProjectPagesQuery({
      page: "3",
      period: "90",
      q: "docs",
      sitemap: "listed",
    });
    expect(projectPagesSearchParams(query).toString()).toBe(
      "q=docs&period=90&page=3&sitemap=listed",
    );
    expect(
      projectPagesSearchParams({
        ...defaultProjectPagesQuery,
        metric: "sessions",
        span: "28",
        status: "new",
        tab: "existing-vs-new",
      }).toString(),
    ).toBe("tab=existing-vs-new&status=new&metric=sessions&span=28");
    expect(projectPagesHref("prj_1", query)).toBe(
      "/app/prj_1/pages?q=docs&period=90&page=3&sitemap=listed",
    );
  });

  it("keeps a Compare selection in the URL without treating it as an All pages filter", () => {
    const query = parseProjectPagesQuery({
      annotation: "sig_note",
      changed: "tag_changed",
      cmetric: "impressions",
      tab: "compare",
      unchanged: "tag_control",
    });
    expect(query).toMatchObject({
      annotation: "sig_note",
      changed: "tag_changed",
      compareMetric: "impressions",
      tab: "compare",
      unchanged: "tag_control",
    });
    expect(projectPagesSearchParams(query).toString()).toBe(
      "tab=compare&changed=tag_changed&unchanged=tag_control&annotation=sig_note&cmetric=impressions",
    );
    expect(parseProjectPagesQuery({ cmetric: "rank" }).compareMetric).toBeUndefined();
    const filled = fillProjectPagesCompareQuery(
      { ...defaultProjectPagesQuery, tab: "compare" },
      {
        annotationId: "sig_note",
        changedTagId: "tag_changed",
        selectedMetric: "clicks",
        unchangedTagId: "tag_control",
      },
    );
    expect(filled?.changed).toBe("tag_changed");
    expect(
      fillProjectPagesCompareQuery(
        { ...defaultProjectPagesQuery, changed: "tag_keep", tab: "compare" },
        {
          annotationId: null,
          changedTagId: "tag_other",
          selectedMetric: null,
          unchangedTagId: null,
        },
      ),
    ).toBeNull();
  });

  it("keeps a Core Web Vitals filter in the URL", () => {
    const query = parseProjectPagesQuery({ cwv: "needs_work" });
    expect(query.cwv).toBe("needs_work");
    expect(projectPagesSearchParams(query).get("cwv")).toBe("needs_work");
    expect(parseProjectPagesQuery({ cwv: "great" }).cwv).toBeUndefined();
  });

  it("turns a Search Console preset into an inclusive date window", () => {
    const period = projectPagesPeriod("28", new Date("2026-11-10T20:00:00.000Z"));
    expect(period.period.id).toBe("28");
    expect(period.period.days).toBe(28);
    expect(dateKey(period.from)).toBe(period.window.current.start);
    expect(dateKey(period.to)).toBe(period.window.current.end);
    expect(period.window.current.end < period.window.current.start).toBe(false);
  });
});
