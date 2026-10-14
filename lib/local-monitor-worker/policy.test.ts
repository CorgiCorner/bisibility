import { describe, expect, it } from "vitest";
import { monitorWorkerPolicy } from "./policy";

describe("Local worker normal-queue policy", () => {
  it("uses the maintained configured normal polling and collection window", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(
      monitorWorkerPolicy(now, {
        NODE_ENV: "test",
        DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS: "30",
        DATAFORSEO_QUEUE_MAX_AGE_SECONDS: "1800",
      }),
    ).toEqual({ pollIntervalMs: 30000, collectionDeadline: new Date(now.getTime() + 1800000) });
  });
  it("fails closed on an invalid configured policy", () => {
    expect(() =>
      monitorWorkerPolicy(new Date(), {
        NODE_ENV: "test",
        DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS: "1",
      }),
    ).toThrow("Invalid configured");
  });
});
