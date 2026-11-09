import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activity: vi.fn(), continueAsNew: vi.fn() }));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => ({ domainVerificationActivity: mocks.activity }),
  continueAsNew: mocks.continueAsNew,
}));

import { domainVerificationWorkflow } from "./domain-verification-workflow";

beforeEach(() => vi.clearAllMocks());
it("passes the notice cursor to later batches even when none were delivered", async () => {
  mocks.activity
    .mockResolvedValueOnce({
      checked: 0,
      notices: 0,
      hasMore: true,
      noticeCursor: "row19",
      noticeScanComplete: false,
    })
    .mockResolvedValueOnce({ checked: 0, notices: 1, hasMore: false });
  await expect(domainVerificationWorkflow()).resolves.toEqual({ checked: 0, notices: 1 });
  expect(mocks.activity).toHaveBeenNthCalledWith(2, "row19", false);
  expect(mocks.continueAsNew).not.toHaveBeenCalled();
});
it("preserves progress when the workflow continues as new", async () => {
  mocks.activity.mockResolvedValue({
    checked: 0,
    notices: 0,
    hasMore: true,
    noticeCursor: "row399",
    noticeScanComplete: false,
  });
  await domainVerificationWorkflow("row199");
  expect(mocks.activity).toHaveBeenNthCalledWith(1, "row199", false);
  expect(mocks.activity).toHaveBeenCalledTimes(20);
  expect(mocks.continueAsNew).toHaveBeenCalledWith("row399", false);
});
it("preserves an exhausted notice scan across batches and continuation", async () => {
  mocks.activity.mockResolvedValue({
    checked: 20,
    notices: 0,
    hasMore: true,
    noticeCursor: "row18",
    noticeScanComplete: true,
  });
  await domainVerificationWorkflow("row18", true);
  expect(mocks.activity).toHaveBeenNthCalledWith(1, "row18", true);
  expect(mocks.activity).toHaveBeenNthCalledWith(20, "row18", true);
  expect(mocks.continueAsNew).toHaveBeenCalledWith("row18", true);
});
