import { dataForSeoObservationRun } from "@/lib/providers/serp/observation-extract-dataforseo";
import { describe, expect, it } from "vitest";
import { opaqueIdentifier } from "./opaque-identifier";
import { queuedDataForSeoObservation } from "./queued-dataforseo";

const at = new Date("2026-10-12T10:00:00.000Z");
const items = [
  { type: "local_pack", title: "Synthetic company", cid: "90071992547409931234", rank_group: 1 },
];
describe("queued capture parity", () => {
  it("extracts the same items and original scope as live from a frozen echo", () => {
    const queue = queuedDataForSeoObservation(
      {
        data: {
          location_name: "City A",
          language_code: "en",
          device: "desktop",
          stop_crawl_on_match: [],
        },
      },
      items,
      100,
      at,
    );
    const live = dataForSeoObservationRun({
      items,
      sentScope: { scope: { location: "City A", language: "en", device: "desktop" } },
      configuredScope: { location: "City A", language: "en", device: "desktop" },
      completeness: "complete",
      executedAt: at,
      requestPolicy: {
        depth: 100,
        findTargetsIn: null,
        forcedAiOverview: false,
        stopOnMatch: false,
      },
    });
    expect(queue).toEqual(live);
    expect(queue.requestPolicy.evidence?.completeThrough.organic_result).toBeNull();
  });
  it("retains observations even when legacy request metadata is unavailable", () => {
    const queue = queuedDataForSeoObservation({}, items, 100, at);
    expect(queue.configuredScope).toEqual({ location: "", language: "", device: "" });
    expect(queue.completeness).toBe("unknown");
    expect(queue.items).toHaveLength(1);
  });
  it("preserves opaque string IDs and rejects unsafe numeric identities", () => {
    expect(opaqueIdentifier("90071992547409931234")).toBe("90071992547409931234");
    expect(opaqueIdentifier(9_007_199_254_740_992)).toBeNull();
    expect(opaqueIdentifier(1.2)).toBeNull();
    expect(opaqueIdentifier(123)).toBe("123");
  });
});
