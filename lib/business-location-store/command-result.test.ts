import { IdentityMapsUrlError } from "@/lib/business-locations/identity-errors";
import { describe, expect, it, vi } from "vitest";
import { businessCommandResult } from "./command-result";
import { BusinessLocationConflictError } from "./errors";

describe("typed business command boundary", () => {
  it.each([
    "identifier_claimed",
    "idempotency_conflict",
    "state_conflict",
    "review_cursor_conflict",
  ] as const)("does not leak or offer CAS recovery for %s", async (reason) => {
    const current = vi.fn(async () => ({ privateOwner: "never returned" }));
    const result = await businessCommandResult(async () => {
      throw new BusinessLocationConflictError(reason);
    }, current);
    expect(result).toEqual(
      reason === "identifier_claimed"
        ? { kind: "identifier_claimed" }
        : { kind: "conflict", current: null, reason },
    );
    expect(current).not.toHaveBeenCalled();
  });
  it("refreshes actual revision conflict but retains unavailable current after revoked read", async () => {
    const run = async () => {
      throw new BusinessLocationConflictError();
    };
    expect(await businessCommandResult(run, async () => "fresh")).toEqual({
      kind: "conflict",
      reason: "revision_conflict",
      current: "fresh",
    });
    expect(
      await businessCommandResult(run, async () => {
        throw new Error("revoked");
      }),
    ).toEqual({ kind: "conflict", reason: "revision_conflict", current: null });
  });
  it("distinguishes URL contradiction from uncertain infrastructure without interpreting arbitrary 409", async () => {
    expect(
      await businessCommandResult(async () => {
        throw new IdentityMapsUrlError("maps_identifier_conflict", "Fixed test contradiction");
      }),
    ).toEqual({ kind: "identity_error", reason: "maps_identifier_conflict" });
    expect(
      await businessCommandResult(async () => {
        throw { status: 409 };
      }),
    ).toEqual({ kind: "error" });
  });
});
