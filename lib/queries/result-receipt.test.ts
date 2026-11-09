import { beforeEach, expect, it, vi } from "vitest";
import { keyword, now, rankCheck, resetOverviewMocks } from "./overview-query.test-fixture";

const receipt = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: receipt }));
const { getOverview } = await import("./overview");
const { getOverviewMocks } = await import("./overview-query.test-fixture");

beforeEach(() => {
  resetOverviewMocks();
  receipt.mockClear();
});

it.each([false, true])(
  "records overview delivery only with measured results: %s",
  async (measured) => {
    getOverviewMocks().prisma.keyword.findMany.mockResolvedValue(
      measured ? [keyword({ rankChecks: [rankCheck()] })] : [],
    );
    await getOverview("prj_1", { now });
    expect(receipt).toHaveBeenCalledWith({ userId: "user_1", surface: "app", nonEmpty: measured });
  },
);

it("does not record an overview rejected by authorization", async () => {
  getOverviewMocks().requireReadableProject.mockRejectedValueOnce(new Error("forbidden"));
  await expect(getOverview("prj_1", { now })).rejects.toThrow("forbidden");
  expect(receipt).not.toHaveBeenCalled();
});
