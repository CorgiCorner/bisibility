import { describe, expect, it } from "vitest";
import {
  buildFailureBreakdown,
  buildProviderHealthMatrix,
  checkFailureRate,
  type FailureBreakdown,
  type FailureBreakdownInput,
  healthToneForRate,
} from "./instance-admin-health";

type GroupHasKeywordId = "keywordId" extends keyof FailureBreakdown["groups"][number]
  ? true
  : false;

const groupHasKeywordId: GroupHasKeywordId = false;

const failure = (
  provider: string,
  errorSummary: string,
  projectId: string,
  occurredAt: string,
): FailureBreakdownInput => ({ errorSummary, occurredAt, projectId, provider });

describe("instance admin failure breakdown", () => {
  it("groups failures by provider and summary with time bounds and project counts", () => {
    const result = buildFailureBreakdown([
      failure("provider-b", "Timed out", "project-2", "2026-07-17T03:00:00.000Z"),
      failure("provider-a", "Timed out", "project-2", "2026-07-17T02:00:00.000Z"),
      failure("provider-a", "Timed out", "project-1", "2026-07-17T04:00:00.000Z"),
      failure("provider-a", "Timed out", "project-1", "2026-07-17T01:00:00.000Z"),
    ]);

    expect(result).toEqual({
      groups: [
        {
          count: 3,
          errorSummary: "Timed out",
          firstSeen: "2026-07-17T01:00:00.000Z",
          lastSeen: "2026-07-17T04:00:00.000Z",
          projectCount: 2,
          projectIds: ["project-1", "project-2"],
          provider: "provider-a",
        },
        {
          count: 1,
          errorSummary: "Timed out",
          firstSeen: "2026-07-17T03:00:00.000Z",
          lastSeen: "2026-07-17T03:00:00.000Z",
          projectCount: 1,
          projectIds: ["project-2"],
          provider: "provider-b",
        },
      ],
      remainderCount: 0,
    });
  });

  it("shows at most three project IDs only for concentrated groups", () => {
    const concentrated = Array.from({ length: 5 }, (_, index) =>
      failure("provider", "Failed", `project-${5 - index}`, "2026-07-17T01:00:00.000Z"),
    );
    const diffuse = Array.from({ length: 6 }, (_, index) =>
      failure("provider", "Rate limited", `project-${index}`, "2026-07-17T01:00:00.000Z"),
    );

    const result = buildFailureBreakdown([...diffuse, ...concentrated]);

    expect(result.groups[0]).toMatchObject({ projectCount: 6, projectIds: [] });
    expect(result.groups[1]).toMatchObject({
      projectCount: 5,
      projectIds: ["project-1", "project-2", "project-3"],
    });
  });

  it("caps sorted groups and reports the omitted group count", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      failure("provider", `Error ${index}`, "project", "2026-07-17T01:00:00.000Z"),
    );

    const result = buildFailureBreakdown(rows, 3);

    expect(result.groups.map((group) => group.errorSummary)).toEqual([
      "Error 0",
      "Error 1",
      "Error 2",
    ]);
    expect(result.remainderCount).toBe(7);
  });

  it("does not let input-only fields reach the result", () => {
    const row = {
      ...failure("provider", "Failed", "project", "2026-07-17T01:00:00.000Z"),
      keywordId: "keyword-private",
    };

    expect(groupHasKeywordId).toBe(false);
    expect(JSON.stringify(buildFailureBreakdown([row]))).not.toContain("keyword");
  });

  it("keeps rendered group count invariant for a 200k-row fixture", () => {
    const small = [
      failure("a", "Failed", "project-1", "2026-07-17T01:00:00.000Z"),
      failure("b", "Timed out", "project-2", "2026-07-17T01:00:00.000Z"),
      failure("c", "Rate limited", "project-3", "2026-07-17T01:00:00.000Z"),
    ];
    const large = Array.from({ length: 200_000 }, (_, index) => small[index % small.length]);

    expect(buildFailureBreakdown(large).groups).toHaveLength(
      buildFailureBreakdown(small).groups.length,
    );
  });
});

describe("instance admin provider health", () => {
  it("buckets statuses and calculates nearest-rank p95 age and failure rate", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    const rows = [
      { latestSuccessAt: "2026-07-17T11:59:59.000Z", provider: "b", status: "failed" },
      {
        latestSuccessAt: "2026-07-17T12:00:01.000Z",
        provider: "a",
        status: "succeeded_with_data",
      },
      {
        latestSuccessAt: "2026-07-17T11:59:58.000Z",
        provider: "a",
        status: "succeeded_empty",
      },
      {
        latestSuccessAt: "2026-07-17T11:59:57.000Z",
        provider: "a",
        status: "deferred_rate_limit",
      },
      { latestSuccessAt: null, provider: "a", status: "failed" },
      { latestSuccessAt: null, provider: "a", status: "not_run" },
      { latestSuccessAt: null, provider: "a", status: "not_applicable" },
      { latestSuccessAt: null, provider: "a", status: "unexpected" },
    ];

    expect(buildProviderHealthMatrix(rows, now)).toEqual([
      {
        failed: 1,
        failureRatePercent: 25,
        notRun: 3,
        ok: 2,
        p95AgeMs: 3_000,
        provider: "a",
        stale: 1,
      },
      {
        failed: 1,
        failureRatePercent: 100,
        notRun: 0,
        ok: 0,
        p95AgeMs: 1_000,
        provider: "b",
        stale: 0,
      },
    ]);
  });

  it("returns null rates and age when no status has run successfully or failed", () => {
    const result = buildProviderHealthMatrix(
      [{ latestSuccessAt: null, provider: "provider", status: "not_run" }],
      new Date("2026-07-17T12:00:00.000Z"),
    );

    expect(result[0]).toMatchObject({ failureRatePercent: null, p95AgeMs: null });
    expect(checkFailureRate(0, 0)).toBeNull();
  });

  it("uses exact health tone thresholds", () => {
    expect(healthToneForRate(null)).toBe("unknown");
    expect(healthToneForRate(4.999)).toBe("ok");
    expect(healthToneForRate(5)).toBe("stale");
    expect(healthToneForRate(20)).toBe("stale");
    expect(healthToneForRate(20.001)).toBe("failed");
    expect(checkFailureRate(1, 3)).toBe(25);
  });
});
