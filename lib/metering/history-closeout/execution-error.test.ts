import { expect, it } from "vitest";
import { CloseoutExecutionError, closeoutFailureCategory } from "./execution-error";

it("distinguishes acquisition and expiry without emitting sensitive driver details", () => {
  const acquisition = closeoutFailureCategory({
    code: "P2028",
    meta: { error: "Unable to start a transaction; secret-address" },
  });
  expect(acquisition).toEqual({ code: "P2028", category: "transaction_acquisition_timeout" });
  expect(
    closeoutFailureCategory({
      code: "P2028",
      meta: { error: "query on expired transaction; secret-sql" },
    }).category,
  ).toBe("transaction_expired");
  const error = new CloseoutExecutionError({
    ...acquisition,
    elapsedMs: 6500,
    statements: 0,
    phase: "transaction",
    mode: "read_only_preview",
    timeoutMs: 180000,
    maxWaitMs: 30000,
  });
  expect(JSON.stringify(error.execution)).not.toMatch(/secret-address|secret-sql/);
  expect(closeoutFailureCategory({ code: "Bearer secret-value" }).code).toBe("CLOSEOUT_REFUSED");
});
