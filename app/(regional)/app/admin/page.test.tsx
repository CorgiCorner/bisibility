import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.access }));

import Page from "./page";

beforeEach(() => vi.clearAllMocks());
it("redirects an authorized administrator to Status", async () => {
  mocks.access.mockResolvedValue({ user: { id: "admin" } });
  await Page();
  expect(permanentRedirect).toHaveBeenCalledWith("/app/admin/overview/status");
});
it("does not redirect an unauthorized visitor", async () => {
  mocks.access.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
  await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(permanentRedirect).not.toHaveBeenCalled();
});
