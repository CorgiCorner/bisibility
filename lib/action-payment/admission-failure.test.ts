import {
  DeploymentAdmissionExhaustedError,
  OwnProviderKeyRequiredError,
} from "@/lib/providers/execution-extension-errors";
import { expect, it } from "vitest";
import { paymentAdmissionFailure } from "./admission-failure";
import type { ActionPaymentReceipt } from "./contract";

const payment: ActionPaymentReceipt = {
  actionId: "action",
  quoteId: "quote",
  option: {
    id: "route",
    providerId: "future",
    providerLabel: "Future",
    connectionId: "conn_a00000000000000000000000",
    fundingSource: "platform",
    payableUnit: { kind: "credits", key: "credits", singular: "credit", plural: "credits" },
  },
  state: "settled",
  charge: {
    value: "2",
    certainty: "measured",
    unit: { kind: "credits", key: "credits", singular: "credit", plural: "credits" },
  },
};
it("distinguishes actual balance, wallet budget, connection budget and own-key refusals", () => {
  const cases = [
    [new DeploymentAdmissionExhaustedError("balance"), "insufficient_credits"],
    [
      new DeploymentAdmissionExhaustedError("budget", { scope: "wallet" }),
      "wallet_budget_exhausted",
    ],
    [new DeploymentAdmissionExhaustedError("budget", { scope: "connection" }), "budget_exhausted"],
    [
      new OwnProviderKeyRequiredError({ provider: "future", capability: "keyword_research" }),
      "own_credentials_required",
    ],
  ] as const;
  for (const [error, reason] of cases)
    expect(paymentAdmissionFailure(error, payment, 1)).toMatchObject({
      ok: false,
      reason,
      payment,
      costCents: 1,
    });
});
it("retains the detailed budget denial without inventing a monetary provider amount", () => {
  expect(
    paymentAdmissionFailure(
      new DeploymentAdmissionExhaustedError("budget", {
        scope: "connection",
        budgetReason: "usage_reconciliation_required",
        surface: "programmatic",
        resetAt: new Date("2026-11-01"),
      }),
      payment,
    ),
  ).toMatchObject({
    reason: "budget_exhausted",
    budgetReason: "usage_reconciliation_required",
    surface: "programmatic",
    resetAt: Date.parse("2026-11-01"),
    payment,
  });
  expect(paymentAdmissionFailure(new Error("unknown"), payment)).toBeNull();
});
