import type { BacklinksRow } from "@/lib/backlinks/types";
import { dateOnlyFromFrozenNow } from "@/tests/clock";
import { describe, expect, it } from "vitest";
import { backlinksExportContent } from "./backlinks-table-export";

const now = new Date("2026-07-24T12:00:00.000Z");
const rows: BacklinksRow[] = [
  {
    anchor: 'Acme, "desk"',
    domainAuthority: 51,
    firstSeen: dateOnlyFromFrozenNow(),
    flags: ["nofollow"],
    linksCount: 2,
    lostAt: null,
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/review",
    spamScore: 5,
    status: "new",
    targetUrl: "https://acme.test/desks",
  },
];

describe("backlinksExportContent", () => {
  it.each([
    [
      "backlinks",
      "one_per_domain",
      "source,anchor_target,coverage,flags,da,spam,links,first_seen,status,lost_at",
    ],
    [
      "backlinks",
      "all_links",
      "source,anchor,target,flags,da,spam,links,first_seen,status,lost_at",
    ],
    [
      "referring_domains",
      "one_per_domain",
      "referring_domain,target_pages,da,spam,links,first_seen",
    ],
    ["top_pages", "one_per_domain", "top_page,referring_domains,da,spam,links,first_seen"],
    ["anchors", "one_per_domain", "anchor,referring_domains,da,spam,links,first_seen"],
  ] as const)("builds the %s/%s CSV columns", (view, slice, header) => {
    expect(backlinksExportContent({ now, rows, slice, view }).split("\n")[0]).toBe(header);
  });

  it("escapes backlink fields using the Research CSV convention", () => {
    const csv = backlinksExportContent({ now, rows, slice: "all_links", view: "backlinks" });
    expect(csv).toContain('"Acme, ""desk"""');
  });
});
