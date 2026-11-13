import { describe, expect, it } from "vitest";
import { boundChartMarkers, CHART_MARKER_LIMIT, chartMarkersFromRecords } from "./chart-markers";

const range = { fromKey: "2026-11-01", toKey: "2026-11-07" };

describe("chartMarkersFromRecords", () => {
  it("classifies the same sources as the annotations page and drops rank signals", () => {
    const markers = chartMarkersFromRecords({
      range,
      signals: [
        {
          actor: null,
          happenedAt: "2026-11-03T15:00:00.000Z",
          id: "sig_note",
          payload: { note: "FAQ added" },
          source: "manual",
          type: "note",
          url: null,
        },
        {
          actor: null,
          happenedAt: "2026-11-04T15:00:00.000Z",
          id: "sig_rank",
          payload: { note: "rank" },
          source: "rank_tracker",
          type: "rank.changed",
          url: null,
        },
        {
          actor: null,
          happenedAt: "2026-10-01T15:00:00.000Z",
          id: "sig_old",
          payload: { note: "too early" },
          source: "manual",
          type: "note",
          url: null,
        },
      ],
      timeZone: "UTC",
      updates: [
        {
          beginsAt: "2026-10-28T00:00:00.000Z",
          endsAt: "2026-11-04T00:00:00.000Z",
          id: "google_1",
          name: "November spam update",
          service: "Ranking",
          uri: "incidents/google_1",
        },
      ],
    });

    expect(markers).toEqual([
      expect.objectContaining({
        dateKey: "2026-10-28",
        endDateKey: "2026-11-04",
        id: "google:google_1",
        kind: "search_engine",
        title: "November spam update",
      }),
      expect.objectContaining({
        dateKey: "2026-11-03",
        id: "sig_note",
        kind: "note",
        title: "FAQ added",
      }),
    ]);
  });

  it("keeps notes and Google updates when the window has more markers than the cap", () => {
    const deploys = Array.from({ length: CHART_MARKER_LIMIT }, (_, index) => ({
      actor: null,
      happenedAt: "2026-11-02T12:00:00.000Z",
      id: `deploy_${index}`,
      payload: { message: `Deploy ${index}` },
      source: "deploy",
      type: "deploy.completed",
      url: null,
    }));
    const markers = chartMarkersFromRecords({
      range,
      signals: [
        ...deploys,
        {
          actor: null,
          happenedAt: "2026-11-05T12:00:00.000Z",
          id: "sig_note",
          payload: { note: "Keep me" },
          source: "manual",
          type: "note",
          url: null,
        },
      ],
      timeZone: "UTC",
      updates: [
        {
          beginsAt: "2026-11-06T00:00:00.000Z",
          endsAt: null,
          id: "google_2",
          name: "Keep the rollout",
          service: "Ranking",
          uri: "incidents/google_2",
        },
      ],
    });

    expect(markers).toHaveLength(CHART_MARKER_LIMIT);
    expect(markers.map((marker) => marker.id)).toContain("sig_note");
    expect(markers.map((marker) => marker.id)).toContain("google:google_2");
    expect(markers.filter((marker) => marker.kind === "deploy")).toHaveLength(
      CHART_MARKER_LIMIT - 2,
    );
  });

  it("keeps generated titles as catalog fields and leaves notes verbatim", () => {
    const markers = chartMarkersFromRecords({
      range,
      signals: [
        {
          actor: null,
          happenedAt: "2026-11-03T15:00:00.000Z",
          id: "sig_sitemap",
          payload: { addedCount: 2, removedCount: 1 },
          source: "sitemap",
          type: "sitemap.changed",
          url: "https://example.com/sitemap.xml",
        },
        {
          actor: null,
          happenedAt: "2026-11-04T15:00:00.000Z",
          id: "sig_deploy",
          payload: {},
          source: "deploy",
          type: "deploy.completed",
          url: null,
        },
        {
          actor: null,
          happenedAt: "2026-11-05T15:00:00.000Z",
          id: "sig_content",
          payload: { title: "Pricing page" },
          source: "cms",
          type: "page.changed",
          url: "https://example.com/pricing",
        },
        {
          actor: null,
          happenedAt: "2026-11-06T15:00:00.000Z",
          id: "sig_gone",
          payload: {},
          source: "url_inspection",
          type: "url.deindexed",
          url: "https://example.com/old",
        },
      ],
      timeZone: "UTC",
      updates: [],
    });

    expect(markers).toEqual([
      expect.objectContaining({
        added: 2,
        generated: "sitemapTitle",
        id: "sig_sitemap",
        kind: "sitemap",
        removed: 1,
        title: "",
      }),
      expect.objectContaining({
        generated: "deployFallback",
        id: "sig_deploy",
        kind: "deploy",
        title: "",
      }),
      expect.objectContaining({
        id: "sig_content",
        kind: "content",
        source: "https://example.com/pricing",
        title: "Pricing page",
      }),
      expect.objectContaining({
        generated: "deindexedTitle",
        id: "sig_gone",
        kind: "content",
        title: "",
      }),
    ]);
    expect(markers.find((marker) => marker.id === "sig_content")).not.toHaveProperty("generated");
    expect(JSON.stringify(markers)).not.toContain("Sitemap:");
  });
});

describe("boundChartMarkers", () => {
  it("drops duplicate ids", () => {
    const marker = {
      dateKey: "2026-11-01",
      id: "same",
      kind: "note" as const,
      title: "Once",
    };
    expect(boundChartMarkers([marker, marker])).toEqual([marker]);
  });
});
