import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ defer: vi.fn(), tx: {} }));

vi.mock("server-only", () => ({}));
vi.mock("../db/prisma", () => ({
  prisma: { $transaction: (callback: (tx: unknown) => unknown) => callback(mocks.tx) },
}));
vi.mock("../rank-check/runs/items", () => ({ deferRunItemForBusyKeyword: mocks.defer }));

import { throwIfRunItemKeywordBusy } from "./rank-check-busy-keyword";

const uniqueViolation = Object.assign(new Error("unique"), { code: "P2002" });

describe("throwIfRunItemKeywordBusy", () => {
  beforeEach(() => {
    mocks.defer.mockReset();
  });

  it("stops the workflow without retry once the busy item is deferred", async () => {
    mocks.defer.mockResolvedValue(true);

    await expect(
      throwIfRunItemKeywordBusy(uniqueViolation, { keywordId: "keyword_1", runItemId: "item_1" }),
    ).rejects.toMatchObject({ nonRetryable: true, type: "rank_check_run_item_keyword_busy" });
    expect(mocks.defer).toHaveBeenCalledWith(mocks.tx, {
      keywordId: "keyword_1",
      now: expect.any(Date),
      runItemId: "item_1",
    });
  });

  it("hands back every other failure to the caller unchanged", async () => {
    mocks.defer.mockResolvedValue(false);

    await expect(
      throwIfRunItemKeywordBusy(uniqueViolation, { keywordId: "keyword_1", runItemId: "item_1" }),
    ).resolves.toBeUndefined();
    await expect(
      throwIfRunItemKeywordBusy(new Error("database down"), {
        keywordId: "keyword_1",
        runItemId: "item_1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      throwIfRunItemKeywordBusy(uniqueViolation, { keywordId: "keyword_1" }),
    ).resolves.toBeUndefined();
    expect(mocks.defer).toHaveBeenCalledTimes(1);
  });
});
