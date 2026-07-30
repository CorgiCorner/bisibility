import type { BacklinksRow } from "@/lib/backlinks/types";
import { describe, expect, it } from "vitest";
import {
  aggregateBacklinksView,
  collapseDomainRows,
  domainFilterCounts,
  groupBacklinksByDomain,
  visibleBacklinkRows,
} from "./backlinks-table-model";

const now = new Date("2026-07-24T12:00:00.000Z");

function row(overrides: Partial<BacklinksRow> = {}): BacklinksRow {
  return {
    anchor: "Acme",
    domainAuthority: 40,
    firstSeen: "2026-07-10",
    flags: [],
    linksCount: 1,
    lostAt: null,
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/page",
    spamScore: 2,
    status: "active",
    targetUrl: "https://acme.test/",
    ...overrides,
  };
}

describe("backlinks table model", () => {
  it("groups by domain and sorts groups by descending DA", () => {
    const groups = groupBacklinksByDomain(
      [
        row(),
        row({ sourceUrl: "https://example.com/two", targetUrl: "https://acme.test/two" }),
        row({ domainAuthority: 80, sourceDomain: "strong.test" }),
      ],
      now,
    );

    expect(groups.map((group) => group.sourceDomain)).toEqual(["strong.test", "example.com"]);
    expect(groups[1]).toMatchObject({ linksCount: 2, targetCount: 2 });
  });

  it("counts new and lost chips by unique domain", () => {
    const groups = groupBacklinksByDomain(
      [
        row({ sourceDomain: "new.test", status: "new" }),
        row({ sourceDomain: "new.test", sourceUrl: "https://new.test/two", status: "new" }),
        row({ lostAt: "2026-07-12", sourceDomain: "lost.test", status: "lost" }),
      ],
      now,
    );

    expect(domainFilterCounts(groups, now)).toEqual({ all: 2, broken: 0, lost: 1, new: 1 });
  });

  it("collapses identical anchor and target runs after two representative links", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row({ sourceUrl: `https://example.com/${index}` }),
    );
    const items = collapseDomainRows(rows);

    expect(items.map((item) => item.kind)).toEqual(["row", "row", "collapsed"]);
    expect(items[2]).toMatchObject({ count: 3 });
    expect(collapseDomainRows(rows, new Set(["Acme\u0000https://acme.test/"]))).toHaveLength(5);
  });

  it("aggregates referring domains, top pages, and anchors over fetched rows", () => {
    const rows = [
      row(),
      row({ sourceDomain: "other.test", sourceUrl: "https://other.test/one" }),
      row({ anchor: "Shop", targetUrl: "https://acme.test/shop" }),
    ];

    expect(aggregateBacklinksView("referring_domains", rows, now)).toEqual(
      expect.arrayContaining([expect.objectContaining({ coverageCount: 2 })]),
    );
    expect(aggregateBacklinksView("top_pages", rows, now)).toHaveLength(2);
    expect(aggregateBacklinksView("anchors", rows, now)).toHaveLength(2);
  });

  it("keeps lost links for 90 days and drops older losses", () => {
    const rows = [
      row({ lostAt: "2026-05-01", sourceDomain: "visible.test", status: "lost" }),
      row({ lostAt: "2026-04-01", sourceDomain: "expired.test", status: "lost" }),
    ];

    expect(visibleBacklinkRows(rows, now).map((item) => item.sourceDomain)).toEqual([
      "visible.test",
    ]);
  });
});
