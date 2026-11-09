import { describe, expect, it } from "vitest";
import {
  mergeSnapshotPage,
  SNAPSHOT_EXTENSION_WINDOW_MS,
  snapshotPrecedingOrganicCount,
} from "./snapshot-extension";
import { readSnapshotContinuation, snapshotExtensionView } from "./snapshot-extension-state";

const capturedAt = "2026-09-28T00:00:00.000Z";
const context = {
  version: 1,
  capturedAt,
  nextStart: 20,
  ended: false,
  connectionId: "connection-1",
  keyword: "sample query",
  domain: "example.com",
  device: "desktop",
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
const raw = { snapshotContinuation: context };
const row = (rank: number, url = `https://example.org/page-${rank}`) => ({
  rank,
  url,
  title: null,
  domain: "example.org",
});

describe("snapshot extension", () => {
  it("allows continuation only inside the fixed original 15-minute window", () => {
    const start = Date.parse(capturedAt);
    expect(
      snapshotExtensionView("serpapi", raw, new Date(start + SNAPSHOT_EXTENSION_WINDOW_MS - 1))
        .reason,
    ).toBe("available");
    expect(
      snapshotExtensionView("serpapi", raw, new Date(start + SNAPSHOT_EXTENSION_WINDOW_MS)).reason,
    ).toBe("expired");
    expect(snapshotExtensionView("serpapi", raw, new Date(start - 1)).reason).toBe("expired");
  });
  it("fails closed for unsupported providers, legacy scope and malformed continuation", () => {
    expect(snapshotExtensionView("dataforseo", raw).reason).toBe("unsupported");
    expect(snapshotExtensionView("serpapi", {}).reason).toBe("legacy");
    expect(
      readSnapshotContinuation({ snapshotContinuation: { ...context, nextStart: 21 } }),
    ).toBeNull();
    expect(
      snapshotExtensionView("serpapi", { ...raw, snapshotExtension: { version: 2 } }).reason,
    ).toBe("failed");
  });
  it("does not offer pages after the provider end or top 100", () => {
    for (const override of [{ ended: true }, { nextStart: 100 }]) {
      expect(
        snapshotExtensionView(
          "serpapi",
          { snapshotContinuation: { ...context, ...override } },
          new Date(capturedAt),
        ).reason,
      ).toBe("complete");
    }
  });
  it("does not offer a replay after a failed or interrupted paid request", () => {
    const extension = {
      version: 1,
      state: "running",
      nextStart: 20,
      ended: false,
      pages: [],
      leaseUntil: "2026-09-28T00:01:30.000Z",
    };
    expect(
      snapshotExtensionView(
        "serpapi",
        { ...raw, snapshotExtension: extension },
        new Date(capturedAt),
      ).reason,
    ).toBe("running");
    expect(
      snapshotExtensionView(
        "serpapi",
        { ...raw, snapshotExtension: extension },
        new Date(extension.leaseUntil),
      ).reason,
    ).toBe("failed");
  });
  it("keeps original URLs and positions, distinct same-domain pages and gaps", () => {
    const original = [row(5, "https://example.com/a")];
    const incoming = [
      row(21, "https://example.com/a#section"),
      row(22, "https://example.com/b"),
      row(23, "https://example.com/b"),
      row(24, "https://example.com/b?edition=2"),
      row(5, "https://example.org/changed"),
    ];
    expect(mergeSnapshotPage(original, incoming)).toEqual({
      rows: [incoming[1], incoming[3]],
      skippedDuplicates: 3,
    });
    expect(original).toEqual([row(5, "https://example.com/a")]);
  });
  it("keeps the later timestamp and exposes no connection or request credentials", () => {
    const page = {
      start: 20,
      fetchedAt: "2026-09-28T00:02:00.000Z",
      skippedDuplicates: 1,
      rows: [row(23, "https://example.com/new")],
    };
    const view = snapshotExtensionView(
      "serpapi",
      {
        ...raw,
        snapshotExtension: {
          version: 1,
          state: "idle",
          nextStart: 30,
          ended: false,
          pages: [page],
        },
      },
      new Date(page.fetchedAt),
    );
    expect(view.expiresAt).toBe("2026-09-28T00:15:00.000Z");
    expect(view.pages[0]).toMatchObject({
      fetchedAt: page.fetchedAt,
      skippedDuplicates: 1,
      rows: [{ position: 23 }],
    });
    expect(JSON.stringify(view)).not.toContain("connection-1");
  });
});

describe("snapshotPrecedingOrganicCount", () => {
  it("counts a short first page by its organic results, not the nominal page size", () => {
    const original = Array.from({ length: 9 }, (_, index) => row(index + 1));
    expect(snapshotPrecedingOrganicCount(original, [])).toBe(9);
  });
  it("continues across stored extension pages including skipped duplicates", () => {
    const original = Array.from({ length: 9 }, (_, index) => row(index + 1));
    const pages = [
      { skippedDuplicates: 1, rows: [row(10), row(11), row(12)] },
      { skippedDuplicates: 0, rows: [row(16)] },
    ];
    // Page 2 returned 4 organic results (3 stored + 1 duplicate): 9 + 4 = 13; page 3 stored rank 16.
    expect(snapshotPrecedingOrganicCount(original, pages.slice(0, 1))).toBe(13);
    expect(snapshotPrecedingOrganicCount(original, pages)).toBe(16);
  });
  it("is zero with nothing stored and never below the highest stored rank", () => {
    expect(snapshotPrecedingOrganicCount([], [])).toBe(0);
    expect(snapshotPrecedingOrganicCount([row(3), row(10)], [])).toBe(10);
  });
  it("uses the persisted organic count when a trailing row was dropped from the stored rows", () => {
    // Ten organic results were returned but the tenth (an unresolved redirect) was not stored.
    const original = Array.from({ length: 9 }, (_, index) => row(index + 1));
    expect(snapshotPrecedingOrganicCount(original, [], 10)).toBe(10);
    // Page 2 returned ten, stored nine (11-19): the next page still continues after rank 20.
    const pages = [
      {
        organicReturned: 10,
        skippedDuplicates: 0,
        rows: Array.from({ length: 9 }, (_, index) => row(11 + index)),
      },
    ];
    expect(snapshotPrecedingOrganicCount(original, pages, 10)).toBe(20);
  });
  it("falls back to the stored-row derivation for pages saved before the count was persisted", () => {
    const original = Array.from({ length: 9 }, (_, index) => row(index + 1));
    const pages = [
      { skippedDuplicates: 0, rows: [row(10), row(11)] },
      { organicReturned: 4, skippedDuplicates: 0, rows: [row(12)] },
    ];
    expect(snapshotPrecedingOrganicCount(original, pages)).toBe(15);
  });
});

describe("snapshot continuation organic count", () => {
  it("keeps a persisted organic count and rejects an out-of-range one", () => {
    expect(
      readSnapshotContinuation({ snapshotContinuation: { ...context, organicReturned: 10 } }),
    ).toMatchObject({ organicReturned: 10 });
    expect(
      readSnapshotContinuation({ snapshotContinuation: { ...context, organicReturned: -1 } }),
    ).toBeNull();
    expect(readSnapshotContinuation(raw)?.organicReturned).toBeUndefined();
  });
  it("does not expose native responses or the persisted per-page organic count in the view", () => {
    const view = snapshotExtensionView(
      "serpapi",
      {
        snapshotContinuation: context,
        snapshotExtension: {
          version: 1,
          state: "idle",
          nextStart: 30,
          ended: false,
          pages: [
            {
              start: 20,
              fetchedAt: capturedAt,
              skippedDuplicates: 0,
              organicReturned: 10,
              provider_response: [{ native: true }],
              rows: [],
            },
          ],
        },
      },
      new Date(Date.parse(capturedAt) + 1000),
    );
    expect(view.pages).toHaveLength(1);
    expect(view.pages[0]).not.toHaveProperty("organicReturned");
    expect(view.pages[0]).not.toHaveProperty("provider_response");
  });
});
