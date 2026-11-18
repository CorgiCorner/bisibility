import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { modelCostEvidenceSchema } from "@/lib/providers/model/transport-contract";
import { expect, it } from "vitest";
import { unknownMoney } from "./contract-fixtures.test-support";

const money = (amount: string) => ({
  ...unknownMoney,
  amount,
  certainty: "reported" as const,
  basis: "provider_response" as const,
});
const comparisonCases = [
  { label: "zero", total: "0.000", amount: "0.0", valid: true },
  { label: "trailing fractional zeros", total: "0.10", amount: "0.1000", valid: true },
  { label: "unequal scales", total: "10", amount: "9.9999999999999999999999", valid: true },
  { label: "ordinary overflow", total: "0.10", amount: "0.30", valid: false },
  { label: "integer width", total: "9.9999", amount: "10", valid: false },
  { label: "integer order", total: "12", amount: "13", valid: false },
  { label: "maximum integer", total: "9".repeat(2048), amount: "8".repeat(2048), valid: true },
  {
    label: "maximum integer overflow",
    total: "8".repeat(2048),
    amount: "9".repeat(2048),
    valid: false,
  },
  { label: "maximum scale equality", total: "0.1", amount: `0.1${"0".repeat(2045)}`, valid: true },
  { label: "maximum scale overflow", total: "0", amount: `0.${"0".repeat(2045)}1`, valid: false },
  {
    label: "fractional precision",
    total: `0.${"0".repeat(2045)}1`,
    amount: `0.${"0".repeat(2045)}2`,
    valid: false,
  },
];

it.each(
  comparisonCases.flatMap((testCase) => [
    { ...testCase, component: "input" },
    { ...testCase, component: "output" },
  ]),
)("N2 compares $component with its sibling null: $label", ({ total, amount, valid, component }) => {
  expect(paymentDecimalSchema.safeParse(total).success).toBe(true);
  expect(paymentDecimalSchema.safeParse(amount).success).toBe(true);
  const parsed = modelCostEvidenceSchema.safeParse({
    providerReported: null,
    localEstimate: null,
    upstreamInference: {
      total: money(total),
      input: null,
      output: null,
      [component]: money(amount),
    },
  });
  expect(parsed.success).toBe(valid);
  if (!valid && !parsed.success)
    expect(parsed.error.issues).toContainEqual(
      expect.objectContaining({
        message: "Inference components cannot exceed their total.",
      }),
    );
});

it.each([
  "",
  "00",
  "01",
  "00.1",
  "+1",
  "-1",
  "-0",
  "1e2",
  "1E-2",
  ".1",
  "1.",
  " 1",
  "1 ",
  "1\n",
  "1".repeat(2049),
  `0.${"1".repeat(2047)}`,
])("N2 rejects unsupported decimal form at index %$", (amount) => {
  expect(paymentDecimalSchema.safeParse(amount).success).toBe(false);
  expect(
    modelCostEvidenceSchema.safeParse({
      providerReported: null,
      localEstimate: null,
      upstreamInference: { total: money(amount), input: null, output: null },
    }).success,
  ).toBe(false);
});

it.each([
  { total: null, input: money("999"), output: money("999") },
  { total: money("0"), input: null, output: null },
  null,
])("N2 preserves unreported totals and components at index %$", (upstreamInference) => {
  const evidence = { providerReported: null, localEstimate: null, upstreamInference };
  expect(modelCostEvidenceSchema.parse(evidence)).toEqual(evidence);
});
