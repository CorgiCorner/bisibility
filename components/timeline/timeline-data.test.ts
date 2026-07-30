import type { TimelineSignalRow } from "@/lib/queries/timeline";
import { timelineGroups } from "@/lib/timeline/timeline-data";
import { describe, expect, it } from "vitest";

const now = new Date("2026-07-04T12:00:00.000Z");

function signalRow(overrides: Partial<TimelineSignalRow> = {}): TimelineSignalRow {
  return {
    createdAt: new Date("2026-07-04T10:30:00.000Z"),
    createdBy: null,
    createdById: null,
    happenedAt: new Date("2026-07-04T10:30:00.000Z"),
    id: "signal_1",
    keyword: { publicId: "kw_1", text: "seo software" },
    keywordId: "keyword_1",
    payload: null,
    projectId: "project_1",
    publicId: "sig_1",
    severity: "info",
    source: "rank_tracker",
    type: "ranking.changed",
    url: "https://example.com/pricing",
    ...overrides,
  };
}

function firstItem(row: TimelineSignalRow) {
  return timelineGroups([row], now)[0]?.items[0];
}

describe("timeline data mapping", () => {
  it("maps ranking changes with keyword context and position", () => {
    expect(
      firstItem(
        signalRow({
          payload: { after: 14, before: 18, delta: 4 },
        }),
      ),
    ).toMatchObject({
      icon: "rankings",
      meta: "Keyword: seo software · Rank tracker",
      position: "#14",
      tint: "green",
      title: "Position 18 → 14",
      urlLabel: "/pricing",
    });
  });

  it("maps ranking URL changes with the URL changed badge", () => {
    expect(
      firstItem(
        signalRow({
          payload: {
            after: "https://example.com/new",
            before: "https://example.com/old",
            matchesTargetUrl: false,
          },
          severity: "warning",
          type: "ranking_url.changed",
          url: "https://example.com/new",
        }),
      ),
    ).toMatchObject({
      badge: "URL changed",
      note: "/old → /new",
      tint: "amber",
      title: "Ranking URL changed",
      urlLabel: "/new",
    });
  });

  it("maps manual notes with author context and critical tint", () => {
    expect(
      firstItem(
        signalRow({
          createdBy: { email: "jan@example.com", name: "Alex Example" },
          payload: { note: "Launch annotation" },
          severity: "critical",
          source: "manual",
          type: "note",
          url: null,
        }),
      ),
    ).toMatchObject({
      icon: "notes",
      meta: "Keyword: seo software · Manual · by Alex Example",
      tint: "red",
      title: "Launch annotation",
    });
  });

  it("drops non-http(s) URLs so they never render as links", () => {
    expect(
      firstItem(
        signalRow({
          payload: { url: "javascript:alert(1)" },
          url: null,
        }),
      ),
    ).toMatchObject({ url: undefined });
    expect(firstItem(signalRow({ url: "javascript:alert(1)" }))).toMatchObject({
      url: undefined,
    });
    expect(firstItem(signalRow())).toMatchObject({ url: "https://example.com/pricing" });
  });

  it("maps page and deploy signal types to their source icons", () => {
    expect(
      firstItem(
        signalRow({
          source: "url_inspection",
          type: "url.indexed",
        }),
      ),
    ).toMatchObject({ icon: "pages", title: "URL indexed" });
    expect(
      firstItem(
        signalRow({
          source: "deploy",
          type: "deploy.completed",
        }),
      ),
    ).toMatchObject({ icon: "deploys", title: "Deploy completed" });
  });

  it("visibly marks synthetic deploy signals as test events", () => {
    expect(
      firstItem(
        signalRow({
          keyword: null,
          keywordId: null,
          payload: { deploymentId: "test_123", provider: "generic", test: true },
          publicId: "sig_test",
          source: "deploy",
          type: "deploy.completed",
        }),
      ),
    ).toMatchObject({
      badge: "Test event",
      id: "sig_test",
      title: "Deploy completed",
    });
  });

  it("maps deploy payload fields into timeline details", () => {
    expect(
      firstItem(
        signalRow({
          keyword: null,
          keywordId: null,
          payload: {
            deploymentId: "dpl_123",
            environment: "production",
            paths: ["/", "/pricing"],
            provider: "vercel",
          },
          source: "deploy",
          type: "deploy.completed",
        }),
      ),
    ).toMatchObject({
      details: [
        { label: "Provider", value: "Vercel" },
        { label: "Deployment ID", value: "dpl_123" },
        { label: "Environment", value: "production" },
        { label: "Paths", value: "/, /pricing" },
      ],
    });
  });

  it("maps sitemap changes as page events with compact diff counts", () => {
    expect(
      firstItem(
        signalRow({
          payload: { addedCount: 4, lastmodChangedCount: 2, removedCount: 1 },
          source: "sitemap",
          type: "sitemap.changed",
          url: "https://example.com/sitemap.xml",
        }),
      ),
    ).toMatchObject({
      icon: "pages",
      meta: "Keyword: seo software · Sitemap",
      note: "+4 / -1 / 2 lastmod",
      title: "Sitemap changed",
      urlLabel: "/sitemap.xml",
    });
  });
});
