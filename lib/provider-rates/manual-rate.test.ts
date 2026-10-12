import { expect, test } from "vitest";
import { withRankCheckManualRate } from "./manual-rate";

test("manual projection keeps exact values and ignores legacy columns", () => {
  for (const amountCents of ["0", "1.2345"]) {
    const source = {
      credentialSource: "own",
      costPerCheckCents: 99,
      rates: [{ feature: "rank_check", amountCents }],
    };
    expect(withRankCheckManualRate(source).costPerCheckCents).toBe(amountCents);
    expect(source.costPerCheckCents).toBe(99);
  }
});

test("no manual row stays absent, including a stale legacy override", () => {
  expect(
    withRankCheckManualRate({ credentialSource: "own", costPerCheckCents: 99, rates: [] })
      .costPerCheckCents,
  ).toBeNull();
});

test("keeps the Decimal JSON wire representation for the legacy API field", () => {
  for (const amountCents of [0, { toString: () => "1.2345" }]) {
    const projected = withRankCheckManualRate({
      credentialSource: "own",
      rates: [{ feature: "rank_check", amountCents }],
    });
    expect(JSON.parse(JSON.stringify(projected)).costPerCheckCents).toBe(String(amountCents));
  }
});

test("hosted connections cannot expose their stored manual provider price", () => {
  expect(
    withRankCheckManualRate({
      credentialSource: "hosted",
      rates: [{ feature: "rank_check", amountCents: "5" }],
    }).costPerCheckCents,
  ).toBeNull();
});
