import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  RANK_CHECK_COMPLETED_STATUS,
  RANK_CHECK_FAILED_STATUS,
  RANK_CHECK_RUNNING_STATUS,
} from "./keyword-check-state";
import { rankCheckListQuery, rankCheckListStatuses } from "./rank-check-list-query";

const parse = (query: string) =>
  rankCheckListQuery(new URL(`https://example.com/api/v1/keywords/k/rank-checks?${query}`));

describe("listRankChecks query", () => {
  it("filters by the persisted rank-check statuses", () => {
    expect([...rankCheckListStatuses].sort()).toEqual(
      [RANK_CHECK_COMPLETED_STATUS, RANK_CHECK_FAILED_STATUS, RANK_CHECK_RUNNING_STATUS].sort(),
    );
    expect(parse("status=failed&since=2026-09-01&limit=")).toEqual({
      since: "2026-09-01",
      status: "failed",
    });
  });

  it("rejects an unknown status instead of listing every executed check", () => {
    expect(() => parse("status=queued")).toThrow(ZodError);
  });
});
