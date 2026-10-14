import { describe, expect, it } from "vitest";
import { monitorProgress } from "./progress";

const deadline = new Date("2026-10-12T12:00:00Z"),
  after = new Date(deadline.getTime() + 1),
  before = new Date(deadline.getTime() - 1);
describe("durable cleanup after admission expiry", () => {
  it("continues cleanup of an unsent held item after expiry, even beside an unknown sent item", () => {
    expect(
      monitorProgress(
        [
          {
            targetId: "unsent",
            status: "claimed",
            resolution: "awaiting_dispatch",
            ownerRetained: true,
          },
          {
            targetId: "sent",
            status: "unknown_acceptance",
            resolution: "needs_provider_evidence",
            ownerRetained: true,
          },
        ],
        new Set(["sent"]),
        deadline,
        after,
      ),
    ).toBe("pending");
  });
  it("does not release possible-send uncertainty when its collection window expires", () => {
    expect(
      monitorProgress(
        [
          {
            targetId: "sent",
            status: "unknown_acceptance",
            resolution: "needs_provider_evidence",
            ownerRetained: true,
          },
        ],
        new Set(["sent"]),
        deadline,
        after,
      ),
    ).toBe("blocked");
  });
  it("finishes cancelled unsent work only after canonical ownership release", () => {
    expect(
      monitorProgress(
        [
          {
            targetId: "unsent",
            status: "cancelled",
            resolution: "cancelled",
            ownerRetained: false,
          },
        ],
        new Set(),
        deadline,
        after,
      ),
    ).toBe("complete");
  });
  it("polls accepted original tasks only within the retained window", () => {
    const items = [
      {
        targetId: "sent",
        status: "accepted" as const,
        resolution: "awaiting_collection" as const,
        ownerRetained: true,
      },
    ];
    expect(monitorProgress(items, new Set(), deadline, before)).toBe("pending");
    expect(monitorProgress(items, new Set(), deadline, after)).toBe("blocked");
  });
  it("stops for review if canonical unsent cleanup detects an actual fence", () => {
    expect(
      monitorProgress(
        [
          {
            targetId: "unsent",
            status: "claimed",
            resolution: "awaiting_dispatch",
            ownerRetained: true,
          },
        ],
        new Set(["unsent"]),
        deadline,
        after,
      ),
    ).toBe("blocked");
  });
});
