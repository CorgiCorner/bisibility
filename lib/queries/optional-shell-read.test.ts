import { afterEach, expect, it, vi } from "vitest";
import { optionalShellRead } from "./optional-shell-read";

afterEach(() => vi.restoreAllMocks());
it("keeps an optional database timeout out of the page without logging private details", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = Object.assign(new Error("private database detail"), { code: "P2028" });
  await expect(optionalShellRead(Promise.reject(error), "account_notice")).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith("[workspace-shell] optional read unavailable", {
    part: "account_notice",
    code: "P2028",
  });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private database detail");
});
it("preserves an available decoration", async () => {
  await expect(
    optionalShellRead(Promise.resolve({ label: "Ready" }), "plan_status"),
  ).resolves.toEqual({ label: "Ready" });
});
it("does not swallow authorization redirects or unexpected failures", async () => {
  const error = new Error("NEXT_REDIRECT");
  await expect(optionalShellRead(Promise.reject(error), "plan_status")).rejects.toBe(error);
});
