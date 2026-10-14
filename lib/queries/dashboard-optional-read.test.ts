import { AuthorizationError } from "@/lib/auth/authorize";
import { describe, expect, it, vi } from "vitest";
import { optionalDashboardRead } from "./dashboard-optional-read";

vi.mock("server-only", () => ({}));
describe("optional dashboard read", () => {
  it("returns error only after a successful fresh authorization check, without leaking error detail", async () => {
    const authorize = vi.fn(async () => undefined);
    const value = await optionalDashboardRead(async () => {
      throw new Error("internal query detail");
    }, authorize);
    expect(value).toEqual({ state: "error", value: null });
    expect(authorize).toHaveBeenCalledOnce();
  });
  it("propagates revoked access rather than producing a widget error", async () => {
    const failure = new AuthorizationError("forbidden");
    await expect(
      optionalDashboardRead(
        async () => {
          throw new Error("unavailable");
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
  });
  it.each(["NEXT_REDIRECT;/login;307;", "NEXT_HTTP_ERROR_FALLBACK;404"])(
    "retains framework control flow %s",
    async (digest) => {
      const failure = { digest };
      const authorize = vi.fn();
      await expect(
        optionalDashboardRead(async () => {
          throw failure;
        }, authorize),
      ).rejects.toBe(failure);
      expect(authorize).not.toHaveBeenCalled();
    },
  );
});
