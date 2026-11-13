import { describe, expect, it } from "vitest";
import { mapProjectPageRow, type ProjectPageListRecord } from "./list-row";

const row: ProjectPageListRecord = {
  aiCitations: 2,
  checkedAt: null,
  clicks: null,
  coverageState: null,
  firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
  impressions: null,
  indexGroup: null,
  keywords: 0,
  lastSeenAt: new Date("2026-11-01T00:00:00.000Z"),
  listed: false,
  path: "/pricing",
  position: null,
  presenceId: null,
  sessionValue: null,
  sitemapLastSeenAt: null,
  sources: {
    manual: {
      firstSeenAt: "2026-10-01T00:00:00.000Z",
      lastSeenAt: "2026-10-01T00:00:00.000Z",
    },
  },
  verdict: null,
};

describe("mapProjectPageRow", () => {
  it("returns null metrics when a source is not connected or has no row", () => {
    const mapped = mapProjectPageRow(row, { domain: "www.example.com", sessions: "none" });
    expect(mapped.searchConsole).toBeNull();
    expect(mapped.sessions).toBeNull();
    expect(mapped.conversions).toBeNull();
    expect(mapped.index).toBeNull();
    expect(mapped.keywords).toBe(0);
    expect(mapped.url).toBe("https://www.example.com/pricing");
    expect(mapped.sources.manual?.firstSeenAt).toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("flags the rolling plausible window only when that provider supplies sessions", () => {
    const mapped = mapProjectPageRow(
      { ...row, sessionValue: 12 },
      { domain: "example.com", sessions: "plausible" },
    );
    expect(
      mapProjectPageRow({ ...row, conversionValue: 4 }, { domain: "example.com", sessions: "none" })
        .conversions,
    ).toBe(4);
    expect(
      mapProjectPageRow(
        { ...row, conversionValue: null },
        { domain: "example.com", sessions: "none" },
      ).conversions,
    ).toBeNull();
    expect(mapped.sessions).toEqual({
      provider: "plausible",
      value: 12,
      windowNote: "rolling_28_days",
    });
  });

  it("maps a mobile vitals row and leaves a page with no reading empty", () => {
    expect(mapProjectPageRow(row, { domain: "example.com", sessions: "none" }).vitals).toBeNull();
    const mapped = mapProjectPageRow(
      {
        ...row,
        vitalsCls: "0.0200",
        vitalsInpMs: 120,
        vitalsLcpMs: 2100,
        vitalsSource: "field",
        vitalsStatus: "good",
      },
      { domain: "example.com", sessions: "none" },
    );
    expect(mapped.vitals).toEqual({
      cls: 0.02,
      inpMs: 120,
      lcpMs: 2100,
      source: "field",
      status: "good",
    });
  });
});
