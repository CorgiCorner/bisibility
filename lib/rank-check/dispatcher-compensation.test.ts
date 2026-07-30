import { describe, expect, it, vi } from "vitest";
import { compensateFailedRankCheckClaims } from "./dispatcher-compensation";

vi.mock("server-only", () => ({}));

const claim = {
  advancedCheckAt: "2026-07-30T00:00:00.000Z",
  dueCheckAt: "2026-07-29T00:00:00.000Z",
  keywordId: "keyword_1",
  stateVersion: "123",
};

describe("compensateFailedRankCheckClaims", () => {
  it("restores only the exact state advanced by the failed start", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ keywordId: "keyword_1" }]);

    await expect(
      compensateFailedRankCheckClaims({ claims: [claim] }, { $queryRaw: queryRaw }),
    ).resolves.toEqual({
      requested: 1,
      restored: 1,
      stale: 0,
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('state."nextCheckAt" = failed."advancedCheckAt"');
    expect(query.sql).toContain('state.xmin::text = failed."stateVersion"');
    expect(query.sql).toContain('SET "nextCheckAt" = failed."dueCheckAt"');
    expect(query.values).toContain("keyword_1");
  });

  it("reports a stale guard without overwriting later state", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);

    await expect(
      compensateFailedRankCheckClaims({ claims: [claim] }, { $queryRaw: queryRaw }),
    ).resolves.toEqual({
      requested: 1,
      restored: 0,
      stale: 1,
    });
  });

  it("rejects unbounded or malformed compensation data", async () => {
    const queryRaw = vi.fn();
    await expect(
      compensateFailedRankCheckClaims(
        { claims: Array.from({ length: 501 }, () => claim) },
        { $queryRaw: queryRaw },
      ),
    ).rejects.toThrow("bounded");
    await expect(
      compensateFailedRankCheckClaims(
        { claims: [{ ...claim, advancedCheckAt: "invalid" }] },
        { $queryRaw: queryRaw },
      ),
    ).rejects.toThrow("timestamp");
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
