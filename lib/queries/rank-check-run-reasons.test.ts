import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rankCheck: { findMany: mocks.findMany } } }));

import { rankRunDeferralReasons } from "./rank-check-run-reasons";

beforeEach(() => mocks.findMany.mockReset());
it("projects distinct typed reasons only for the requested project and runs", async () => {
  mocks.findMany.mockResolvedValue([
    { run: { publicId: "run-a" }, deferredReason: "provider_account_blocked" },
    { run: { publicId: "run-a" }, deferredReason: "usage_unconfirmed" },
    { run: { publicId: "run-b" }, deferredReason: "provider_account_blocked" },
  ]);
  const result = await rankRunDeferralReasons("project", ["run-a", "run-b"]);
  expect(result.get("run-a")).toEqual(["provider_account_blocked", "usage_unconfirmed"]);
  expect(result.get("run-b")).toEqual(["provider_account_blocked"]);
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        status: "deferred",
        run: { projectId: "project", publicId: { in: ["run-a", "run-b"] }, deletedAt: null },
      },
    }),
  );
});
