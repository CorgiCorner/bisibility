import { beforeEach, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/admin/oss-accounts", () => ({ getOssAccount: lookup }));

import { lookupOssAdminAccount } from "./instance-admin-pages";

beforeEach(() => vi.clearAllMocks());
it("uses the authorized, audited core lookup without adding fields", async () => {
  lookup.mockResolvedValue({ status: "found", account: { id: "usr_example" } });
  expect(await lookupOssAdminAccount("owner@example.test")).toEqual({
    status: "found",
    account: { id: "usr_example" },
  });
  expect(lookup).toHaveBeenCalledWith("owner@example.test");
});
it("preserves absence and authorization rejection from the builder", async () => {
  lookup.mockResolvedValueOnce(null);
  expect(await lookupOssAdminAccount("usr_example")).toBeNull();
  lookup.mockRejectedValueOnce(new Error("forbidden"));
  await expect(lookupOssAdminAccount("usr_example")).rejects.toThrow("forbidden");
});
