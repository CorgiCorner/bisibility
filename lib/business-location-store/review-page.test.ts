import { describe, expect, it, vi } from "vitest";
import { businessReviewSourceHash, reviewWatermark, selectBusinessReviewPage } from "./review-page";

vi.mock("server-only", () => ({}));
const now = new Date("2026-10-13T05:00:00.000Z");
const items = Array.from({ length: 520 }, (_, ordinal) => ({ id: `item-${ordinal}`, ordinal }));
const scope = {
  projectId: "project-a",
  locationId: "location-a",
  runId: "run-a",
  identityRevisionId: "identity-a",
  sourceHash: "a".repeat(64),
};
describe("retained candidate continuation", () => {
  it("reaches all original items over three bounded pages after a fresh process state, and returns backwards", () => {
    const first = selectBusinessReviewPage([...items].reverse(), scope, reviewWatermark({}, now));
    const second = selectBusinessReviewPage(
      items,
      scope,
      reviewWatermark({ cursor: first.nextCursor }, new Date(now.getTime() + 1000)),
    );
    const third = selectBusinessReviewPage(
      items,
      scope,
      reviewWatermark({ cursor: second.nextCursor }, new Date(now.getTime() + 2000)),
    );
    expect([first.selected.length, second.selected.length, third.selected.length]).toEqual([
      256, 256, 8,
    ]);
    expect([...first.selected, ...second.selected, ...third.selected]).toEqual(items);
    expect([second.watermark, third.watermark]).toEqual([first.watermark, first.watermark]);
    expect(third.nextCursor).toBeNull();
    const back = selectBusinessReviewPage(
      items,
      scope,
      reviewWatermark({ cursor: third.previousCursor }, now),
    );
    expect(back.selected).toEqual(second.selected);
    expect(
      selectBusinessReviewPage(items, scope, reviewWatermark({ cursor: back.previousCursor }, now))
        .selected,
    ).toEqual(first.selected);
  });
  it("refreshes decision watermark without losing the selected original page", () => {
    const first = selectBusinessReviewPage(items, scope, reviewWatermark({}, now));
    const later = new Date(now.getTime() + 1000);
    const refresh = selectBusinessReviewPage(
      items,
      scope,
      reviewWatermark({ cursor: first.nextCursor, mode: "refresh" }, later),
    );
    expect(refresh.offset).toBe(256);
    expect(refresh.watermark).toBe(later.toISOString());
  });
  it.each(["projectId", "locationId", "runId", "identityRevisionId", "sourceHash"] as const)(
    "rejects a changed %s rather than broadening scope",
    (key) => {
      const first = selectBusinessReviewPage(items, scope, reviewWatermark({}, now));
      expect(() =>
        selectBusinessReviewPage(
          items,
          { ...scope, [key]: "foreign" },
          reviewWatermark({ cursor: first.nextCursor }, now),
        ),
      ).toThrowError(expect.objectContaining({ reason: "review_cursor_conflict" }));
    },
  );
  it("refuses missing anchors, malformed and future cursors", () => {
    const first = selectBusinessReviewPage(items, scope, reviewWatermark({}, now));
    expect(() =>
      selectBusinessReviewPage(
        items.filter((item) => item.ordinal !== 255),
        scope,
        reviewWatermark({ cursor: first.nextCursor }, now),
      ),
    ).toThrow();
    expect(() => reviewWatermark({ cursor: "not-json" }, now)).toThrow();
    expect(() => reviewWatermark({ cursor: first.cursor }, new Date(now.getTime() - 1))).toThrow();
  });
  it("binds retained original time and item facts, without transporting raw diagnostic payloads", () => {
    const run = {
      id: "run-a",
      provider: "synthetic",
      surface: "maps",
      engine: "google",
      requestPolicy: { evidence: { adapterVersion: "synthetic-v1" } },
      items: [{ id: "item-a", ordinal: 0, observedAt: now, rawFragment: { secret: "raw" } }],
    };
    const hash = businessReviewSourceHash(run);
    expect(
      businessReviewSourceHash({
        ...run,
        items: [{ ...run.items[0], rawFragment: { secret: "different" } }],
      }),
    ).not.toBe(hash);
    expect(
      businessReviewSourceHash({
        ...run,
        items: [{ ...run.items[0], observedAt: new Date(now.getTime() + 1) }],
      }),
    ).not.toBe(hash);
    expect(businessReviewSourceHash({ ...run, items: [{ ...run.items[0], ordinal: 1 }] })).not.toBe(
      hash,
    );
  });
});
