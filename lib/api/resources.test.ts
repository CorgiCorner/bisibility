import { describe, expect, it } from "vitest";
import { type RankCheckRecord, rankCheckResource } from "./resources";

function checkRecord(runPublicId: string | null): RankCheckRecord {
  return {
    attempts: null,
    checkedAt: new Date("2026-09-05T12:00:00.000Z"),
    costCents: null,
    error: null,
    id: "rank-check-1",
    keyword: { projectId: "project-1", publicId: "kw_a00000000000000000000000" },
    position: 4,
    previousPosition: 7,
    provider: "dataforseo",
    publicId: "check_a00000000000000000000000",
    rankingUrl: "https://example.com/rank-tracker",
    raw: null,
    run: runPublicId ? { publicId: runPublicId } : null,
    status: "completed",
  } as unknown as RankCheckRecord;
}

describe("rankCheckResource", () => {
  it("exposes the public run ID and preserves null for legacy checks", () => {
    expect(rankCheckResource(checkRecord("rcr_a00000000000000000000000"))).toMatchObject({
      run_id: "rcr_a00000000000000000000000",
    });
    expect(rankCheckResource(checkRecord(null))).toMatchObject({ run_id: null });
  });
});
