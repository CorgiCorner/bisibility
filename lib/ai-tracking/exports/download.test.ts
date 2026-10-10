import { trackingSampleFixtures } from "@/components/ai-tracking/fixtures";
import { describe, expect, it, vi } from "vitest";
import { collectTrackingDownload } from "./download";

describe("bounded evidence downloads", () => {
  it("follows every available page and deduplicates samples without losing unknown costs", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [trackingSampleFixtures[0]], nextCursor: "next" })
      .mockResolvedValueOnce({
        items: [trackingSampleFixtures[0], trackingSampleFixtures[2]],
        nextCursor: null,
      });
    const result = await collectTrackingDownload("air_run", "json", fetch);
    expect(fetch.mock.calls).toEqual([[undefined], ["next"]]);
    expect(result).toMatchObject({ loaded: 2, complete: true, nextCursor: null });
    expect(JSON.parse(result.content).items[1]).toMatchObject({
      costUsd: null,
      costState: "unknown",
    });
  });
  it("marks bounded output incomplete and preserves a continuation cursor", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ items: [trackingSampleFixtures[0]], nextCursor: "resume" });
    const result = await collectTrackingDownload("air_run", "json", fetch, undefined, 1);
    expect(result).toMatchObject({ complete: false, nextCursor: "resume" });
    expect(JSON.parse(result.content).scope.complete).toBe(false);
    const csv = await collectTrackingDownload("air_run", "csv", fetch, undefined, 1);
    expect(csv.content).toContain("export_complete,next_cursor,resumed_segment");
    expect(csv.content).toContain("false,resume,false");
    const continuation = vi
      .fn()
      .mockResolvedValue({ items: [trackingSampleFixtures[2]], nextCursor: null });
    await collectTrackingDownload("air_run", "json", continuation, result.nextCursor ?? undefined);
    expect(continuation).toHaveBeenCalledWith("resume");
  });
  it("escapes spreadsheet formulas and refuses cursor loops", async () => {
    const fetch = vi.fn().mockResolvedValue({
      items: [{ ...trackingSampleFixtures[0], prompt: "=1+1" }],
      nextCursor: null,
    });
    expect((await collectTrackingDownload("air_run", "csv", fetch)).content).toContain("'=1+1");
    await expect(
      collectTrackingDownload("air_run", "json", async () => ({ items: [], nextCursor: "same" })),
    ).rejects.toThrow("pagination did not advance");
  });
});
