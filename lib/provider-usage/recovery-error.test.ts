import { describe, expect, it } from "vitest";
import { recoveryErrorCode } from "./recovery-error";

describe("recovery incident causes", () => {
  it("distinguishes conflicting native identity from missing authority", () => {
    expect(recoveryErrorCode(new Error("Original native queued identity conflicts"))).toBe(
      "native_identity_conflict",
    );
    expect(recoveryErrorCode(new Error("Original live paid operation is missing"))).toBe(
      "original_operation_missing",
    );
  });

  it("retains safe database classifications without exposing exception text", () => {
    expect(recoveryErrorCode({ code: "P2028", message: "transaction includes credentials" })).toBe(
      "transaction_timeout",
    );
    expect(recoveryErrorCode(new Error("Bearer private-value https://example.com/private"))).toBe(
      "recovery_failed",
    );
    expect(recoveryErrorCode(null)).toBe("recovery_failed");
  });
});
