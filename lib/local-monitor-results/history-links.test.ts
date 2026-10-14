import { describe, expect, it } from "vitest";
import { localHistoryHref, localHistoryPresetHref, localHistoryRange } from "./history-links";

const asOf = "2026-10-26T12:30:00.000Z",
  href = "/app/project/settings/business-locations/monitors/monitor";
describe("saved Local history navigation", () => {
  it.each([7, 28, 90])(
    "binds %i elapsed days to the frozen asOf without selecting a paid operation",
    (days) => {
      const next = localHistoryPresetHref(href, asOf, String(days));
      if (!next) throw new Error("Expected named history preset");
      const query = new URL(next, "https://example.com").searchParams;
      expect(query.get("asOf")).toBe(asOf);
      expect(query.get("to")).toBe(asOf);
      expect(query.has("run")).toBe(false);
      const from = query.get("from");
      expect(from).toBe(new Date(Date.parse(asOf) - days * 86400000).toISOString());
      expect(localHistoryRange({ from, to: asOf, timeBasis: "occurrence_created_at" }, asOf)).toBe(
        String(days),
      );
    },
  );
  it("retains exact URL interval and run when moving within history", () => {
    const window = {
      from: "2026-10-01T00:00:00.000Z",
      to: asOf,
      timeBasis: "occurrence_created_at" as const,
    };
    const query = new URL(
      localHistoryHref(href, asOf, window, "lmr_original"),
      "https://example.com",
    ).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      asOf,
      from: window.from,
      to: asOf,
      run: "lmr_original",
    });
    expect(localHistoryRange(window, asOf)).toBe("custom");
    expect(localHistoryPresetHref(href, asOf, "invented")).toBeNull();
    expect(localHistoryPresetHref(href, asOf, "all")).not.toContain("from=");
  });
});
