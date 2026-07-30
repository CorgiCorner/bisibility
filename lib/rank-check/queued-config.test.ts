import { afterEach, describe, expect, it, vi } from "vitest";
import { queuedRankCheckConfig } from "./queued-config";

describe("queuedRankCheckConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the queued path off by default", () => {
    expect(queuedRankCheckConfig()).toEqual({
      enabled: false,
      invalidKeys: [],
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      priority: "high",
    });
  });

  it("uses bounded high-priority defaults when explicitly enabled", () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");

    expect(queuedRankCheckConfig()).toMatchObject({
      enabled: true,
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      priority: "high",
    });
  });

  it("uses normal-priority queue defaults", () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "true");
    vi.stubEnv("DATAFORSEO_QUEUE_PRIORITY", "normal");

    expect(queuedRankCheckConfig()).toMatchObject({
      enabled: true,
      maxQueueAgeSeconds: 3600,
      pollIntervalSeconds: 60,
      priority: "normal",
    });
  });

  it.each([
    ["DATAFORSEO_QUEUE_PRIORITY", "urgent"],
    ["DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "0"],
    ["DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "61"],
    ["DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "59"],
    ["DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "1801"],
  ])("fails closed when high-priority %s is invalid", (key, value) => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    vi.stubEnv(key, value);

    expect(queuedRankCheckConfig()).toMatchObject({
      enabled: false,
      invalidKeys: [key],
    });
  });
});
