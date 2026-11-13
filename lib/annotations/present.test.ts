import { describe, expect, it } from "vitest";
import type { AnnotationCopy } from "./present";
import {
  annotationKind,
  chartMarkerTitleFields,
  presentAnnotations,
  searchEngineStatusUrl,
} from "./present";
import { visibleAnnotations } from "./types";

const copy: AnnotationCopy = {
  byActor: (actor) => `by ${actor}`,
  contentFallback: "Content updated",
  deindexedTitle: "URL removed from the index",
  deployFallback: "Deploy",
  detailContent: "From a content signal.",
  detailDeindexed: "This URL is no longer indexed.",
  detailDeploy: "From a deploy webhook.",
  detailGoogle: "Imported from the Google Search Status Dashboard.",
  detailNote: "Manual note.",
  detailSitemap: "From the sitemap monitor.",
  noteFallback: "Note",
  primaryConversion: (from, to) => `Primary conversion source changed from ${from} to ${to}`,
  sitemapTitle: (added, removed) => `Sitemap: ${added} added, ${removed} removed`,
  sourceLabel: (kind) => kind,
};

describe("annotation feed scope", () => {
  it("drops rank signals and keeps notes, deploys, content, sitemap and de-index events", () => {
    expect(annotationKind("rank_tracker", "ranking.changed")).toBeNull();
    expect(annotationKind("search_analytics", "ranking.changed")).toBeNull();
    expect(annotationKind("url_inspection", "url.indexed")).toBeNull();
    expect(annotationKind("url_inspection", "url.deindexed")).toBe("content");
    expect(annotationKind("manual", "note")).toBe("note");
    expect(annotationKind("api", "deploy.completed")).toBe("deploy");
    expect(annotationKind("cms", "page.changed")).toBe("content");
    expect(annotationKind("sitemap", "sitemap.changed")).toBe("sitemap");
  });

  it("merges global Google updates and hides automatic entries on request", () => {
    const entries = presentAnnotations({
      copy,
      rangeLabel: () => "Sep 24 to Oct 8 · rollout complete",
      signals: [
        {
          actor: "Alex Example",
          happenedAt: "2026-11-09T10:00:00.000Z",
          id: "sig_note",
          payload: { note: "Rewrote the title" },
          source: "manual",
          type: "note",
          url: null,
        },
        {
          actor: null,
          happenedAt: "2026-11-07T16:00:00.000Z",
          id: "sig_rank",
          payload: { after: 4, before: 9 },
          source: "rank_tracker",
          type: "ranking.changed",
          url: "https://example.com/",
        },
        {
          actor: null,
          happenedAt: "2026-11-02T12:00:00.000Z",
          id: "sig_deploy",
          payload: { deploymentId: "9a1c0e4", environment: "main" },
          source: "deploy",
          type: "deploy.completed",
          url: null,
        },
      ],
      updates: [
        {
          beginsAt: "2026-09-24T16:15:00.000Z",
          endsAt: "2026-10-08T08:00:00.000Z",
          id: "XhUDXP7A67iHCD2kmbVu",
          name: "September 2026 spam update",
          service: "Ranking",
          uri: "incidents/XhUDXP7A67iHCD2kmbVu",
        },
      ],
    });

    expect(entries.map((entry) => entry.id)).toEqual([
      "sig_note",
      "sig_deploy",
      "google:XhUDXP7A67iHCD2kmbVu",
    ]);
    expect(entries[0]).toMatchObject({
      marker: "N",
      subtitle: "by Alex Example",
      title: "Rewrote the title",
    });
    expect(entries[1]?.title).toBe("Deploy");
    expect(entries[2]).toMatchObject({
      href: "https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu",
      marker: "G",
      range: "Sep 24 to Oct 8 · rollout complete",
    });
    expect(searchEngineStatusUrl("/incidents/abc")).toBe(
      "https://status.search.google.com/incidents/abc",
    );
    expect(visibleAnnotations(entries, "all", true).map((entry) => entry.kind)).toEqual(["note"]);
    expect(visibleAnnotations(entries, "deploy", false).map((entry) => entry.id)).toEqual([
      "sig_deploy",
    ]);
  });

  it("renders a conversion-source change through the catalog instead of stored English", () => {
    const signal = {
      actor: null,
      happenedAt: "2026-11-10T12:00:00.000Z",
      id: "sig_conversion",
      payload: { from: "none", generated: "primaryConversion", to: "ga4" },
      source: "manual",
      type: "note",
      url: null,
    };
    expect(chartMarkerTitleFields(signal)).toEqual({
      from: "none",
      generated: "primaryConversion",
      title: "",
      to: "ga4",
    });
    expect(
      presentAnnotations({
        copy,
        rangeLabel: () => "",
        signals: [signal],
        updates: [],
      })[0]?.title,
    ).toBe("Primary conversion source changed from none to ga4");
  });
});
