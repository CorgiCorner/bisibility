import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  queuedRankCheckConfig,
  resetQueuedRankCheckConfigWarningForTests,
  warnInvalidQueuedRankCheckConfig,
} from "./queued-config";

describe("queuedRankCheckConfig", () => {
  beforeEach(() => {
    resetQueuedRankCheckConfigWarningForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("turns the queued path on by default", () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", undefined);

    expect(queuedRankCheckConfig()).toEqual({
      enabled: true,
      invalidKeys: [],
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      priority: "high",
      taskGetFallbackSeconds: 180,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["", "  "])("treats an empty flag (%j) as on", (value) => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", value);

    expect(queuedRankCheckConfig()).toMatchObject({ enabled: true, invalidKeys: [] });
  });

  it.each(["0", "false", "FALSE", "off", "no", " 0 "])(
    "turns the queued path off only for the explicit falsy flag %j",
    (value) => {
      vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", value);

      expect(queuedRankCheckConfig()).toMatchObject({ enabled: false, invalidKeys: [] });
      expect(console.warn).not.toHaveBeenCalled();
    },
  );

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
    ["DATAFORSEO_QUEUED_TASK_GET_FALLBACK_SECONDS", "0"],
    ["DATAFORSEO_QUEUED_TASK_GET_FALLBACK_SECONDS", "7201"],
    ["DATAFORSEO_QUEUE_PRIORITY", "urgent"],
    ["DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "0"],
    ["DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "61"],
    ["DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "59"],
    ["DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "1801"],
    ["DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "maybe"],
  ])("fails closed when %s is invalid, also with the default flag", (key, value) => {
    vi.stubEnv(key, value);

    expect(queuedRankCheckConfig()).toMatchObject({
      enabled: false,
      invalidKeys: [key],
    });
  });

  it.each([1, 180, 7200])("accepts fallback grace %s seconds", (value) => {
    vi.stubEnv("DATAFORSEO_QUEUED_TASK_GET_FALLBACK_SECONDS", String(value));
    expect(queuedRankCheckConfig()).toMatchObject({ enabled: true, taskGetFallbackSeconds: value });
  });

  it("warns once per process with the invalid key names and no values", () => {
    vi.stubEnv("DATAFORSEO_QUEUE_PRIORITY", "secret-looking-value");
    vi.stubEnv("DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "5");

    queuedRankCheckConfig();
    queuedRankCheckConfig();

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      "[queued-rank-check] invalid queue configuration; the queued route is disabled",
      { invalidKeys: ["DATAFORSEO_QUEUE_PRIORITY", "DATAFORSEO_QUEUE_MAX_AGE_SECONDS"] },
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret-looking-value",
    );
  });

  it("does not warn for a valid configuration", () => {
    const warn = vi.fn();
    expect(warnInvalidQueuedRankCheckConfig({ invalidKeys: [] }, warn)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
