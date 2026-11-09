import { CapacityLimitError } from "@/lib/capacity/errors";
import { beforeEach, expect, it, vi } from "vitest";
import { transferOnScheduleDelete } from "./transfer-on-delete";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  check: vi.fn(),
  manual: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/lib/capacity/schedule-change", () => ({ prepareKeywordScheduleChange: mocks.prepare }));
vi.mock("./service-membership", () => ({
  mirrorManualToKeywords: mocks.manual,
  mirrorScheduleToKeywords: mocks.schedule,
}));
const fallback = { id: "schedule", publicId: "sch_fallback" } as never;
const denial = new CapacityLimitError({
  dimension: "scheduledKeywords",
  limit: 2,
  used: 2,
  requested: 1,
  scope: "account",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue(undefined);
  mocks.prepare.mockResolvedValue({ enabled: true, check: mocks.check });
});
it.each(["cadence", "count"])(
  "preserves schedule deletion with manual fallback after a %s denial",
  async (phase) => {
    const tx = { keyword: { updateMany: vi.fn() } };
    if (phase === "cadence") mocks.prepare.mockRejectedValueOnce(denial);
    else mocks.check.mockRejectedValueOnce(denial);
    expect(
      await transferOnScheduleDelete(tx as never, "project", ["keyword"], fallback),
    ).toBeNull();
    expect(tx.keyword.updateMany).toHaveBeenLastCalledWith({
      data: { checkScheduleId: null },
      where: { id: { in: ["keyword"] } },
    });
    expect(mocks.manual).toHaveBeenCalledWith(tx, "project", ["keyword"]);
  },
);
it("retains the existing default transfer when it fits", async () => {
  const tx = { keyword: { updateMany: vi.fn() } };
  expect(await transferOnScheduleDelete(tx as never, "project", ["keyword"], fallback)).toBe(
    "sch_fallback",
  );
  expect(mocks.manual).not.toHaveBeenCalled();
});
it("does not swallow unexpected persistence failures", async () => {
  const failure = new Error("Persistence failed");
  mocks.check.mockRejectedValueOnce(failure);
  await expect(
    transferOnScheduleDelete(
      { keyword: { updateMany: vi.fn() } } as never,
      "project",
      ["keyword"],
      fallback,
    ),
  ).rejects.toBe(failure);
  expect(mocks.manual).not.toHaveBeenCalled();
});
