import type { BacklinksRow } from "@/lib/backlinks/types";
import { describe, expect, it } from "vitest";
import {
  activeBacklinksFilterCount,
  type BacklinksFilters,
  backlinkLinkTypeCounts,
  emptyBacklinksFilters,
  filterBacklinksDomainGroups,
  groupMatchesBacklinksFilters,
} from "./backlinks-filters-model";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";
import { groupBacklinksByDomain } from "./backlinks-table-model";

const now = new Date("2026-07-24T12:00:00.000Z");

function filters(overrides: Partial<BacklinksFilters>): BacklinksFilters {
  return { ...emptyBacklinksFilters, ...overrides };
}

function row(overrides: Partial<BacklinksRow>): BacklinksRow {
  return {
    anchor: "Acme desk",
    domainAuthority: 50,
    firstSeen: "2026-07-01",
    flags: [],
    linksCount: 1,
    lostAt: null,
    sourceDomain: "example.test",
    sourceUrl: "https://example.test/review",
    spamScore: 4,
    status: "active",
    targetUrl: "https://acme.test/desks",
    ...overrides,
  };
}

describe("backlinks filters model", () => {
  const fixtureGroups = groupBacklinksByDomain(backlinksSnapshotFixture.rows, now);

  it("counts link flags per domain and treats no nofollow flag as dofollow", () => {
    expect(backlinkLinkTypeCounts(fixtureGroups)).toEqual({
      dofollow: 5,
      image: 1,
      nofollow: 3,
      sitewide: 1,
      sponsored: 0,
      ugc: 1,
    });

    const mixed = groupBacklinksByDomain(
      [
        row({ flags: ["nofollow"], sourceUrl: "https://example.test/no-follow" }),
        row({ flags: [], sourceUrl: "https://example.test/follow" }),
      ],
      now,
    )[0];
    expect(groupMatchesBacklinksFilters(mixed, filters({ linkTypes: ["dofollow"] }), now)).toBe(
      true,
    );
    expect(groupMatchesBacklinksFilters(mixed, filters({ linkTypes: ["nofollow"] }), now)).toBe(
      true,
    );
  });

  it("uses inclusive domain-authority and spam-score bounds", () => {
    const group = groupBacklinksByDomain([row({ domainAuthority: 30, spamScore: 7 })], now)[0];

    expect(
      groupMatchesBacklinksFilters(
        group,
        filters({ domainAuthority: [30, 30], spamScore: [7, 7] }),
        now,
      ),
    ).toBe(true);
    expect(groupMatchesBacklinksFilters(group, filters({ domainAuthority: [31, 100] }), now)).toBe(
      false,
    );
    expect(groupMatchesBacklinksFilters(group, filters({ spamScore: [0, 6] }), now)).toBe(false);
  });

  it("applies inclusive first-seen windows against the reference date", () => {
    const groups = groupBacklinksByDomain(
      [
        row({ firstSeen: "2026-06-24", sourceDomain: "thirty.test" }),
        row({ firstSeen: "2026-04-25", sourceDomain: "ninety.test" }),
        row({ firstSeen: "2026-04-24", sourceDomain: "older.test" }),
      ],
      now,
    );

    expect(
      filterBacklinksDomainGroups(groups, filters({ firstSeen: "30" }), "all", now),
    ).toHaveLength(1);
    expect(
      filterBacklinksDomainGroups(groups, filters({ firstSeen: "90" }), "all", now),
    ).toHaveLength(2);
  });

  it("matches text case-insensitively and excludes matching domains", () => {
    const group = groupBacklinksByDomain(
      [
        row({
          anchor: "ErgoPRO Review",
          sourceDomain: "DeskReview.IO",
          targetUrl: "https://acme.test/Collections/Standing",
        }),
      ],
      now,
    )[0];

    expect(
      groupMatchesBacklinksFilters(
        group,
        filters({ anchorContains: "ergopro", targetUrlContains: "/collections/" }),
        now,
      ),
    ).toBe(true);
    expect(groupMatchesBacklinksFilters(group, filters({ excludeDomain: "review.io" }), now)).toBe(
      false,
    );
  });

  it("counts active logical groups, including DA and spam separately", () => {
    expect(
      activeBacklinksFilterCount(
        filters({
          anchorContains: "acme",
          domainAuthority: [30, 100],
          linkTypes: ["dofollow", "image"],
          spamScore: [0, 7],
          targetUrlContains: "/desks",
        }),
      ),
    ).toBe(4);
  });

  it("composes advanced filters with New and Lost chips using AND", () => {
    const advanced = filters({ domainAuthority: [50, 100] });

    expect(filterBacklinksDomainGroups(fixtureGroups, advanced, "new", now)).toHaveLength(3);
    expect(filterBacklinksDomainGroups(fixtureGroups, advanced, "lost", now)).toHaveLength(1);
    expect(
      filterBacklinksDomainGroups(
        fixtureGroups,
        filters({ domainAuthority: [53, 100] }),
        "lost",
        now,
      ),
    ).toHaveLength(0);
  });
});
