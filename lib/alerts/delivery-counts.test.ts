import { describe, expect, it } from "vitest";
import { storedDeliverySummary } from "./delivery-counts";

describe("stored delivery summary", () => {
  it.each(["email", "push", "slack", "webhook"])(
    "retains every final status for %s without inventing counters",
    (channel) => {
      const rows = ["sent", "failed", "skipped", "unknown"].map((status) => ({ channel, status }));
      expect(storedDeliverySummary(rows)).toEqual(rows);
    },
  );

  it("keeps distinct webhook destination results separate", () => {
    expect(
      storedDeliverySummary([
        { channel: "webhook", status: "sent" },
        { channel: "webhook", status: "failed" },
      ]),
    ).toEqual([
      { channel: "webhook", status: "sent" },
      { channel: "webhook", status: "failed" },
    ]);
  });

  it.each([
    null,
    {},
    [{ channel: "unsupported", status: "sent" }],
    [{ channel: "webhook", status: "unexpected" }],
    [{ channel: "push", counts: { acceptedCount: -1, failedCount: 0, unknownCount: 0 } }],
    [{ channel: "push", counts: { acceptedCount: 1, failedCount: 0 } }],
  ])("rejects malformed persisted evidence %#", (value) => {
    expect(storedDeliverySummary(value)).toEqual([]);
  });
});
