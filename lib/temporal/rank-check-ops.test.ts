import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyDeferredRankCheckOps, notifyFailedRankCheckOps } from "./rank-check-ops";

const mocks = vi.hoisted(() => ({ notifyOps: vi.fn() }));

vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));

describe("rank check ops events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyOps.mockResolvedValue(undefined);
  });

  it("posts failure timing and attempt details with the rank dedupe key", async () => {
    await notifyFailedRankCheckOps({
      keywordId: "keyword_1",
      keywordText: "private keyword for customer@example.eu",
      projectId: "project_1",
      provider: "serpapi",
      providerAttemptCount: 3,
      scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });

    expect(mocks.notifyOps).toHaveBeenCalledWith({
      dedupeKey: "rank:keyword_1:serpapi",
      fields: expect.objectContaining({
        Error: "rank_check_failed",
        Keyword: "keyword_1",
        Project: "project_1",
        "Provider attempts": 3,
        "Scheduled for": "2026-01-01T06:00:00.000Z",
        "Start lag": "5000 ms",
        "Started at": "2026-01-01T06:00:05.000Z",
      }),
      kind: "rank_check",
      severity: "error",
      title: "Rank check failed",
    });
    expect(JSON.stringify(mocks.notifyOps.mock.calls[0])).not.toContain(
      "private keyword for customer@example.eu",
    );
  });

  it("restores keyword names only when explicitly enabled", async () => {
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");

    await notifyFailedRankCheckOps({
      keywordId: "keyword_1",
      keywordText: "private keyword fixture",
      projectId: "project_1",
      provider: "serpapi",
      providerAttemptCount: 1,
      scheduledAt: null,
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });

    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ Keyword: "keyword_1 (private keyword fixture)" }),
      }),
    );
    vi.unstubAllEnvs();
  });

  it("posts deferred warnings and cannot throw into the rank lifecycle", async () => {
    mocks.notifyOps.mockRejectedValueOnce(new Error("Slack failed"));

    await expect(
      notifyDeferredRankCheckOps({
        keywordId: "keyword_1",
        keywordText: "rank tracker",
        projectId: "project_1",
        provider: "serpapi",
        reason: "rate limited",
        scheduledAt: null,
        startedAt: new Date("2026-01-01T06:00:05.000Z"),
      }),
    ).resolves.toBeUndefined();

    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "defer:project_1:rate_limited",
        fields: expect.objectContaining({ Reason: "rate_limited" }),
        kind: "rank_check_deferred",
        severity: "warning",
      }),
    );
  });
});
