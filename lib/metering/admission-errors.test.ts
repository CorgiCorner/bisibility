import { errorFromUnknown } from "@/lib/api/error-mapper";
import { expect, test } from "vitest";
import { BudgetExhaustedError, translatePaidAdmission } from "./admission-errors";
import { PaidAttemptAdmissionError } from "./paid-attempt-types";
import { unresolvedSpendingGate } from "./spending-limits";

test.each(["group", "connection"] as const)(
  "%s uncertainty gate preserves reason and request surface",
  async (kind) => {
    const scope =
      kind === "group"
        ? { kind, namespace: "test", group: "project" }
        : { kind, namespace: "test", connection: "connection" };
    const budget = unresolvedSpendingGate(scope, "history", "2026-10-01T00:00:00Z", 1);
    const error = new PaidAttemptAdmissionError({
      outcome: "exceeded",
      operation: null,
      exceeded: {
        budget,
        used: { unit: "paid_attempts", value: 0n, scale: 0 },
        reserved: { unit: "paid_attempts", value: 0n, scale: 0 },
        code: "allowance_exceeded",
        boundary: "limit",
        resetsAt: null,
      },
    });
    const translated = translatePaidAdmission(error, {
      surface: "programmatic",
      projectId: "project",
      connectionId: "connection",
    });
    const response = errorFromUnknown(
      translated,
      new Headers({ "Retry-After": "60" }),
      new URL("https://example.com/api/v1/checks"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(await response.json()).toMatchObject({
      details: { reason: "usage_reconciliation_required", surface: "programmatic" },
      detail: expect.stringMatching(/reconcil/i),
    });
  },
);

test("legacy incomplete valuations carry a reconciliation reason to clients", async () => {
  const error = new BudgetExhaustedError({
    projectId: "project",
    capCents: 1,
    spentCents: 0,
    valuationIncomplete: true,
  });
  const response = errorFromUnknown(
    error,
    new Headers(),
    new URL("https://example.com/api/v1/checks"),
  );
  const body = await response.json();
  expect(body.details).toMatchObject({ reason: "usage_reconciliation_required" });
  expect(body.details.resets_at).toBeUndefined();
});
