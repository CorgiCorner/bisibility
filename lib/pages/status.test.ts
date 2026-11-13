import { describe, expect, it } from "vitest";
import {
  pageMembershipStatus,
  presenceDeparture,
  snapshotDayNumber,
  statusMatchesFilter,
} from "./status";

const takenOn = new Date("2026-10-01T00:00:00.000Z");
const newest = new Date("2026-10-20T18:00:00.000Z");

function facts(patch: Partial<Parameters<typeof pageMembershipStatus>[0]> = {}) {
  return {
    firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
    inSnapshot: true,
    newestSitemapSeenAt: newest,
    presenceCoverageState: null,
    presencePageFetchState: null,
    sitemapLastSeenAt: newest,
    snapshotTakenOn: takenOn,
    ...patch,
  };
}

describe("page membership status", () => {
  it("counts the snapshot date as day 1", () => {
    expect(snapshotDayNumber(takenOn, new Date("2026-10-01T23:00:00.000Z"))).toBe(1);
    expect(snapshotDayNumber(takenOn, new Date("2026-10-04T00:00:00.000Z"))).toBe(4);
  });

  it("keeps a snapshot page that was seen on the newest sitemap day", () => {
    expect(pageMembershipStatus(facts())).toEqual({ day: null, kind: "in_snapshot" });
  });

  it("marks a page first seen after the snapshot as new, using that day number", () => {
    expect(
      pageMembershipStatus(
        facts({
          firstSeenAt: new Date("2026-10-04T08:00:00.000Z"),
          inSnapshot: false,
          sitemapLastSeenAt: newest,
        }),
      ),
    ).toEqual({ day: 4, kind: "new" });
  });

  it("marks a snapshot page whose sitemap last-seen is older as removed on that day", () => {
    expect(
      pageMembershipStatus(facts({ sitemapLastSeenAt: new Date("2026-10-02T12:00:00.000Z") })),
    ).toEqual({ day: 2, kind: "removed" });
  });

  it("marks a page that appeared later and then left as removed, not new", () => {
    expect(
      pageMembershipStatus(
        facts({
          firstSeenAt: new Date("2026-10-05T00:00:00.000Z"),
          inSnapshot: false,
          sitemapLastSeenAt: new Date("2026-10-05T00:00:00.000Z"),
        }),
      ),
    ).toEqual({ day: 5, kind: "removed" });
  });

  it("reads redirect and not-found from the stored inspection, without preferring a guess", () => {
    expect(presenceDeparture("REDIRECT_ERROR", null)).toBe("redirected");
    expect(presenceDeparture("SUCCESSFUL", "Page with redirect")).toBe("redirected");
    expect(presenceDeparture("NOT_FOUND", null)).toBe("gone");
    expect(presenceDeparture("SOFT_404", "Submitted and indexed")).toBe("gone");
    expect(presenceDeparture(null, "Not found (404)")).toBe("gone");
    expect(presenceDeparture("SUCCESSFUL", "Submitted and indexed")).toBeNull();
    expect(
      pageMembershipStatus(
        facts({
          presenceCoverageState: "Page with redirect",
          sitemapLastSeenAt: new Date("2026-10-02T00:00:00.000Z"),
        }),
      )?.kind,
    ).toBe("redirected");
    expect(
      pageMembershipStatus(
        facts({
          presencePageFetchState: "NOT_FOUND",
          sitemapLastSeenAt: new Date("2026-10-05T00:00:00.000Z"),
        }),
      )?.kind,
    ).toBe("gone");
  });

  it("leaves pages that predate the snapshot and were not in it without a status", () => {
    expect(pageMembershipStatus(facts({ inSnapshot: false }))).toBeNull();
  });

  it("does not call a page removed when the project has no sitemap observation", () => {
    expect(
      pageMembershipStatus(facts({ newestSitemapSeenAt: null, sitemapLastSeenAt: null })),
    ).toEqual({
      day: null,
      kind: "in_snapshot",
    });
  });

  it("groups redirected and gone with the removed filter", () => {
    expect(statusMatchesFilter("removed", "removed")).toBe(true);
    expect(statusMatchesFilter("redirected", "removed")).toBe(true);
    expect(statusMatchesFilter("gone", "removed")).toBe(true);
    expect(statusMatchesFilter("new", "removed")).toBe(false);
    expect(statusMatchesFilter("in_snapshot", "in_snapshot")).toBe(true);
    expect(statusMatchesFilter(null, "new")).toBe(false);
  });
});
