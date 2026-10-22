import { normalizeSchedule } from "@/lib/actions/_schedule";
import { beforeEach, expect, it, vi } from "vitest";
import { assignCreatedKeywordCadences } from "./keyword-create-cadence";

const mocks = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({ setKeywordCadence: mocks.set }));
beforeEach(() => vi.clearAllMocks());
const daily = normalizeSchedule({
  frequency: "daily",
  cronExpression: null,
  jitterMinutes: 60,
  timezone: "UTC",
});
const tx = {} as never;
it("groups a 500-keyword explicit batch into one membership mutation", async () => {
  const accepted = Array.from({ length: 500 }, (_, index) => ({
    created: true,
    keyword: { id: `kw_${index}` },
    row: { schedule: daily },
  }));
  await assignCreatedKeywordCadences(tx, "project1", accepted, null);
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(
    tx,
    "project1",
    accepted.map((row) => row.keyword.id),
    daily,
    null,
  );
});
it("does not schedule omitted input or skipped existing duplicates", async () => {
  await assignCreatedKeywordCadences(
    tx,
    "project1",
    [
      { created: true, keyword: { id: "manual" }, row: {} },
      { created: false, keyword: { id: "skipped" }, row: { schedule: daily } },
    ],
    null,
  );
  expect(mocks.set).not.toHaveBeenCalled();
});
it("preserves an explicit cadence on restored rows and separates depth selections", async () => {
  const explicitDepth = { ...daily, serpDepth: null };
  await assignCreatedKeywordCadences(
    tx,
    "project1",
    [
      { created: false, restored: true, keyword: { id: "restored" }, row: { schedule: daily } },
      { created: true, keyword: { id: "depth" }, row: { schedule: explicitDepth } },
    ],
    "actor1",
  );
  expect(mocks.set).toHaveBeenCalledTimes(2);
  expect(mocks.set).toHaveBeenNthCalledWith(1, tx, "project1", ["restored"], daily, "actor1");
  expect(mocks.set).toHaveBeenNthCalledWith(2, tx, "project1", ["depth"], explicitDepth, "actor1");
});
