import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { result, unknownMoney } from "@/lib/model-playground/contract-fixtures.test-support";
import { expect, it } from "vitest";
import { bindModelPlaygroundResultCheck } from "./model-playground-projection";
import {
  modelPlaygroundResultSchema,
  projectModelPlaygroundRun,
  providerCostsAgree,
  withDemotedRead,
} from "./model-playground-schemas";

const unit = { kind: "currency" as const, code: "USD" };
const reported = {
  ...unknownMoney,
  certainty: "reported",
  amount: "0.12",
  basis: "provider_response",
};
function receipt() {
  const column = result().column;
  return {
    actionId: "attempt",
    quoteId: null,
    state: "unknown",
    option: {
      id: column.payment.optionId,
      connectionId: column.connectionId,
      providerId: column.providerId,
      providerLabel: "Native provider",
      fundingSource: "byok",
      payableUnit: unit,
    },
    charge: { value: null, certainty: "unknown", unit },
    providerCost: { value: "0.12", certainty: "measured", unit },
  };
}
it.each(["certainty", "amount", "currency", "unknown", "precision", "free"])(
  "requires the receipt and result cost to agree: %s",
  (field) => {
    const paymentReceipt = receipt();
    const providerCost = { ...reported };
    if (field === "precision") {
      providerCost.amount = "9007199254740992.000000000000000001";
      paymentReceipt.providerCost.value = `${providerCost.amount}0`;
    }
    if (field === "unknown") {
      Object.assign(providerCost, unknownMoney);
      Object.assign(paymentReceipt.providerCost, { value: null, certainty: "unknown" });
    }
    if (field === "free") {
      providerCost.amount = "0.000";
      Object.assign(paymentReceipt.providerCost, { value: "0", certainty: "free" });
    }
    const value = { ...result(), providerCost, paymentReceipt };
    const parsed = modelPlaygroundResultSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.answer).toBe(value.answer);
    if (field === "certainty") Object.assign(providerCost, unknownMoney);
    if (field === "amount") paymentReceipt.providerCost.value = "0.50";
    if (field === "currency") {
      paymentReceipt.option.payableUnit = { ...unit, code: "EUR" };
      paymentReceipt.charge.unit = { ...unit, code: "EUR" };
      paymentReceipt.providerCost.unit = { ...unit, code: "EUR" };
    }
    if (field === "unknown")
      Object.assign(paymentReceipt.providerCost, { value: "0", certainty: "measured" });
    if (field === "precision")
      paymentReceipt.providerCost.value = "9007199254740992.000000000000000002";
    if (field === "free") {
      providerCost.amount = "0.12";
      Object.assign(paymentReceipt.providerCost, { certainty: "free", value: "0" });
    }
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
  },
);

it("maps reported to measured or free and unknown to unknown", () => {
  const measured = { certainty: "measured", unit: { code: "USD" }, value: "0.12" };
  const reportedCost = { amount: "0.12", certainty: "reported", currency: "USD" };
  expect(providerCostsAgree(reportedCost, measured)).toBe(true);
  expect(providerCostsAgree(reportedCost, { ...measured, certainty: "free", value: "0" })).toBe(
    false,
  );
  expect(
    providerCostsAgree(
      { amount: "0", certainty: "reported", currency: "USD" },
      { certainty: "free", unit: { code: "USD" }, value: "0.000" },
    ),
  ).toBe(true);
  expect(
    providerCostsAgree(
      { amount: null, certainty: "unknown", currency: "USD" },
      { certainty: "unknown", unit: { code: "USD" }, value: null },
    ),
  ).toBe(true);
  expect(providerCostsAgree(reportedCost, { ...measured, certainty: "estimated" })).toBe(false);
  expect(providerCostsAgree(reportedCost, { ...measured, certainty: "unknown", value: null })).toBe(
    false,
  );
});

it("rejects money the decimal regex does not admit", () => {
  // paymentDecimalSchema is /^(?:0|[1-9]\d*)(?:\.\d+)?$/, so a leading + or leading zero
  // never reaches decimal comparison. Trailing zeros still denote the same amount.
  for (const value of ["+0.12", "+1", "00.12", "01", "0.12 ", " 0.12"])
    expect(paymentDecimalSchema.safeParse(value).success, value).toBe(false);
  expect(paymentDecimalSchema.safeParse("0.120").success).toBe(true);
  expect(paymentDecimalSchema.safeParse("0.12").success).toBe(true);
  expect(
    providerCostsAgree(
      { amount: "0.12", certainty: "reported", currency: "USD" },
      { certainty: "measured", unit: { code: "USD" }, value: "0.120" },
    ),
  ).toBe(true);
});

it("degrades a disagreeing receipt and keeps the paid answer", () => {
  const paymentReceipt = receipt();
  const agreeing = {
    ...result(),
    providerCost: { ...reported },
    paymentReceipt: {
      ...paymentReceipt,
      providerCost: { ...paymentReceipt.providerCost, value: "0.120" },
    },
  };
  const projectedAgree = projectModelPlaygroundRun({ columns: [{ result: agreeing }] });
  const agreed = projectedAgree.columns[0].result;
  expect(agreed.paymentReceipt?.providerCost.value).toBe("0.120");
  expect(Object.hasOwn(agreed.paymentReceipt ?? {}, "costEvidence")).toBe(false);
  expect(modelPlaygroundResultSchema.safeParse(agreed).success).toBe(true);
  for (const providerCost of [
    { ...paymentReceipt.providerCost, value: "0.125" },
    { ...paymentReceipt.providerCost, certainty: "estimated" },
  ]) {
    const value = {
      ...result(),
      providerCost: { ...reported },
      paymentReceipt: { ...receipt(), providerCost },
    };
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
    const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
    const parsed = modelPlaygroundResultSchema.safeParse(projected.columns[0].result);
    expect(parsed.success).toBe(true);
    if (!parsed.success) continue;
    expect(parsed.data.answer).toBe(value.answer);
    expect(parsed.data.providerCost).toMatchObject({ amount: "0.12", certainty: "reported" });
    expect(parsed.data.paymentReceipt?.providerCost).toMatchObject({
      certainty: "unknown",
      value: null,
    });
    expect(parsed.data.paymentReceipt?.costEvidence).toBe("mismatch");
  }
});

it("drops a stored mismatch marker when the costs agree and keeps the receipt decimal", () => {
  const paymentReceipt = receipt();
  const value = {
    ...result(),
    providerCost: { ...reported, amount: "1.0" },
    paymentReceipt: {
      ...paymentReceipt,
      costEvidence: "mismatch" as const,
      providerCost: { ...paymentReceipt.providerCost, value: "1" },
    },
  };
  const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
  const kept = projected.columns[0].result;
  expect(kept.paymentReceipt?.providerCost.value).toBe("1");
  expect(Object.hasOwn(kept.paymentReceipt ?? {}, "costEvidence")).toBe(false);
  expect(modelPlaygroundResultSchema.safeParse(kept).success).toBe(true);
});

it("degrades a mismatched receipt onto the option payable unit", () => {
  const paymentReceipt = receipt();
  const eur = { kind: "currency" as const, code: "EUR" };
  const value = {
    ...result(),
    providerCost: { ...reported },
    paymentReceipt: {
      ...paymentReceipt,
      providerCost: { ...paymentReceipt.providerCost, unit: eur, value: "0.50" },
    },
  };
  expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
  const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
  const parsed = modelPlaygroundResultSchema.safeParse(projected.columns[0].result);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.paymentReceipt?.providerCost).toMatchObject({
    certainty: "unknown",
    unit: paymentReceipt.option.payableUnit,
    value: null,
  });
  expect(parsed.data.paymentReceipt?.costEvidence).toBe("mismatch");
});

it("leaves an unsettled receipt unchanged", () => {
  const paymentReceipt = receipt();
  const value = {
    ...result(),
    providerCost: { ...reported },
    paymentReceipt: {
      ...paymentReceipt,
      state: "unknown" as const,
      charge: { ...paymentReceipt.charge, certainty: "unknown" as const, value: null },
      providerCost: { ...paymentReceipt.providerCost, certainty: "unknown" as const, value: null },
      costEvidence: "mismatch" as const,
    },
  };
  const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
  const kept = projected.columns[0].result.paymentReceipt;
  expect(kept?.providerCost).toMatchObject({ certainty: "unknown", value: null });
  expect(Object.hasOwn(kept ?? {}, "costEvidence")).toBe(false);
  expect(modelPlaygroundResultSchema.safeParse(projected.columns[0].result).success).toBe(true);
});

it("keeps a measured receipt beside a demoted estimate", () => {
  const paymentReceipt = receipt();
  paymentReceipt.providerCost = { value: "0.20", certainty: "measured", unit };
  const value = {
    ...result(),
    providerCost: {
      amount: "0.11",
      basis: "rate_card" as const,
      certainty: "estimated" as const,
      currency: "USD",
      rateCardVersion: "v3",
    },
    paymentReceipt,
  };
  const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
  const kept = projected.columns[0].result;
  expect(kept.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
  expect(kept.costEvidence?.localEstimate).toMatchObject({
    amount: "0.11",
    certainty: "estimated",
  });
  expect(kept.paymentReceipt?.providerCost).toMatchObject({ certainty: "measured", value: "0.20" });
  expect(Object.hasOwn(kept.paymentReceipt ?? {}, "costEvidence")).toBe(false);
  expect(modelPlaygroundResultSchema.safeParse(kept).success).toBe(false);
  expect(withDemotedRead(() => modelPlaygroundResultSchema.safeParse(kept).success)).toBe(true);
});

function eurReceipt() {
  const eur = { kind: "currency" as const, code: "EUR" };
  const paymentReceipt = receipt();
  paymentReceipt.option.payableUnit = eur;
  paymentReceipt.charge.unit = eur;
  Object.assign(paymentReceipt.providerCost, { certainty: "unknown", unit: eur, value: null });
  return paymentReceipt;
}

it("uses the receipt currency when a stored cost code is not public", () => {
  const invalid = projectModelPlaygroundRun({
    columns: [
      {
        result: {
          ...result(),
          providerCost: { ...unknownMoney, currency: "usd" },
          paymentReceipt: eurReceipt(),
        },
      },
    ],
  });
  expect(invalid.columns[0].result.providerCost.currency).toBe("EUR");
  const parsedCode = projectModelPlaygroundRun({
    columns: [
      {
        result: {
          ...result(),
          providerCost: {
            amount: "1.25",
            basis: "rate_card" as const,
            certainty: "reported" as const,
            currency: "GBP",
            rateCardVersion: "v1",
          },
          paymentReceipt: eurReceipt(),
        },
      },
    ],
  });
  expect(parsedCode.columns[0].result.providerCost.currency).toBe("GBP");
});

it("uses the receipt currency when a stored cost has no currency", () => {
  const { currency: _currency, ...missing } = unknownMoney;
  const projected = projectModelPlaygroundRun({
    columns: [{ result: { ...result(), providerCost: missing, paymentReceipt: eurReceipt() } }],
  });
  const providerCost = projected.columns[0].result.providerCost as unknown as { currency: string };
  expect(providerCost.currency).toBe("EUR");
  expect(providerCost.currency).not.toBe("USD");
});

it("keeps a paid answer when an estimated cost currency differs from upstream evidence", () => {
  const eur = { kind: "currency" as const, code: "EUR" };
  const paymentReceipt = receipt();
  paymentReceipt.option.payableUnit = eur;
  paymentReceipt.charge.unit = eur;
  paymentReceipt.providerCost = { certainty: "measured", unit: eur, value: "0.20" };
  const value = {
    ...result(),
    providerCost: {
      amount: "0.11",
      basis: "rate_card" as const,
      certainty: "estimated" as const,
      currency: "EUR",
      rateCardVersion: "v3",
    },
    costEvidence: {
      providerReported: null,
      upstreamInference: {
        total: {
          amount: "0.20",
          basis: "provider_response" as const,
          certainty: "reported" as const,
          currency: "USD",
          rateCardVersion: null,
        },
        input: null,
        output: null,
      },
      localEstimate: null,
    },
    paymentReceipt,
  };
  const projected = projectModelPlaygroundRun({ columns: [{ result: value }] });
  const kept = projected.columns[0].result;
  const projectedReceipt = kept.paymentReceipt as unknown as {
    costEvidence?: string;
    providerCost?: { certainty: string; value: string | null };
  };
  expect(kept.answer).toBe(value.answer);
  expect(kept.costEvidence?.localEstimate).toMatchObject({
    amount: "0.11",
    certainty: "estimated",
    currency: "EUR",
  });
  expect(projectedReceipt?.costEvidence).toBeUndefined();
  expect(projectedReceipt?.providerCost).toMatchObject({ certainty: "measured", value: "0.20" });
  expect(withDemotedRead(() => modelPlaygroundResultSchema.safeParse(kept).success)).toBe(true);
});

it("rejects a mismatch marker beside a measured receipt", () => {
  const paymentReceipt = { ...receipt(), costEvidence: "mismatch" as const };
  expect(
    modelPlaygroundResultSchema.safeParse({
      ...result(),
      providerCost: { ...reported },
      paymentReceipt,
    }).success,
  ).toBe(false);
});

it("rejects a stored unknown cost beside a measured receipt", () => {
  const paymentReceipt = receipt();
  paymentReceipt.providerCost = { value: "0.20", certainty: "measured", unit };
  expect(
    modelPlaygroundResultSchema.safeParse({
      ...result(),
      providerCost: { ...unknownMoney },
      costEvidence: {
        providerReported: null,
        upstreamInference: null,
        localEstimate: {
          amount: "0.11",
          basis: "rate_card" as const,
          certainty: "estimated" as const,
          currency: "USD",
          rateCardVersion: "v3",
        },
      },
      paymentReceipt,
    }).success,
  ).toBe(false);
});

it("keeps reported provider evidence when only upstream evidence disagrees", () => {
  const scope = {
    kind: "total" as const,
    includes: [
      "inference",
      "tools",
      "routing",
      "reporting_writes",
      "zero_data_retention",
      "other",
    ] as const,
    excludes: [],
    unknown: [],
  };
  const reportedUsd = {
    amount: "0.20",
    basis: "provider_response" as const,
    certainty: "reported" as const,
    currency: "USD",
    rateCardVersion: null,
  };
  const paymentReceipt = receipt();
  paymentReceipt.providerCost = { value: "0.20", certainty: "measured", unit };
  // Evidence repair already drops a bad upstream slot. This stand-in rejects only that slot.
  bindModelPlaygroundResultCheck({
    safeParse(value: unknown) {
      const parsed = modelPlaygroundResultSchema.safeParse(value);
      const evidence = (value as { costEvidence?: { upstreamInference?: unknown } }).costEvidence;
      if (parsed.success && evidence?.upstreamInference != null) return { success: false };
      return parsed;
    },
  });
  try {
    const projected = projectModelPlaygroundRun({
      columns: [
        {
          result: {
            ...result(),
            providerCost: reportedUsd,
            costEvidence: {
              providerReported: { money: reportedUsd, scope },
              upstreamInference: { total: reportedUsd, input: null, output: null },
              localEstimate: null,
            },
            paymentReceipt,
          },
        },
      ],
    });
    const kept = projected.columns[0].result;
    expect(kept.answer).toBe(result().answer);
    expect(kept.costEvidence?.providerReported).toMatchObject({
      money: { amount: "0.20", currency: "USD" },
    });
    expect(kept.costEvidence?.upstreamInference).toBeNull();
  } finally {
    bindModelPlaygroundResultCheck(modelPlaygroundResultSchema);
  }
});
