import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backfillKeywordDispatchStatesActivity,
  claimDueRankChecksActivity,
  compensateFailedRankCheckClaimsActivity,
} from "./rank-check-dispatcher-activities";

const mocks = vi.hoisted(() => ({
  backfillKeywordDispatchStates: vi.fn(),
  claimDueRankChecks: vi.fn(),
  compensateFailedRankCheckClaims: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../rank-check/dispatcher", () => ({
  claimDueRankChecks: mocks.claimDueRankChecks,
}));
vi.mock("../rank-check/dispatcher-compensation", () => ({
  compensateFailedRankCheckClaims: mocks.compensateFailedRankCheckClaims,
}));
vi.mock("../rank-check/dispatcher-state", () => ({
  backfillKeywordDispatchStates: mocks.backfillKeywordDispatchStates,
}));

describe("claimDueRankChecksActivity", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["legacy", "cutover"] as const)("produces no database work in %s mode", async (mode) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    await expect(claimDueRankChecksActivity()).resolves.toMatchObject({
      claimed: 0,
      groups: [],
      metrics: { outcome: "empty_or_skipped_locked" },
    });
    expect(mocks.claimDueRankChecks).not.toHaveBeenCalled();
  });

  it("claims due work only in dispatcher mode", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    mocks.claimDueRankChecks.mockResolvedValue({
      claimed: 1,
      claimedAt: "2026-07-28T12:00:00.000Z",
      groups: [],
    });

    await expect(claimDueRankChecksActivity()).resolves.toMatchObject({
      claimed: 1,
    });
    expect(mocks.claimDueRankChecks).toHaveBeenCalledOnce();
  });

  it("delegates bounded bootstrap pages to the state service", async () => {
    mocks.backfillKeywordDispatchStates.mockResolvedValue({
      cursor: "keyword_200",
      done: false,
      seeded: 200,
    });

    await expect(
      backfillKeywordDispatchStatesActivity({ cursor: null, pageSize: 200 }),
    ).resolves.toMatchObject({ cursor: "keyword_200", done: false, seeded: 200 });
    expect(mocks.backfillKeywordDispatchStates).toHaveBeenCalledWith({
      cursor: null,
      pageSize: 200,
    });
  });

  it("runs failed-start compensation as a database activity", async () => {
    const input = {
      claims: [
        {
          advancedCheckAt: "2026-07-30T00:00:00.000Z",
          dueCheckAt: "2026-07-29T00:00:00.000Z",
          keywordId: "keyword_1",
          stateVersion: "123",
        },
      ],
    };
    mocks.compensateFailedRankCheckClaims.mockResolvedValue({
      requested: 1,
      restored: 1,
      stale: 0,
    });

    await expect(compensateFailedRankCheckClaimsActivity(input)).resolves.toMatchObject({
      restored: 1,
    });
    expect(mocks.compensateFailedRankCheckClaims).toHaveBeenCalledWith(input);
  });
});
