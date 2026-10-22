import { expect, it } from "vitest";
import { currentChildAmount } from "./child-scope";

const original = {
  free: false,
  authority: "retained",
  amount: "4",
  providerCostCents: "2",
  nativeQuantity: "2",
  items: ["0", "1"],
};
it("allows a cheaper subset without changing the accepted child identity", () => {
  expect(currentChildAmount(original, { ...original, amount: "2", items: ["1"] })).toBe("2");
});
it("rejects an added item, a same-size replacement, a higher amount or a missing scope", () => {
  for (const change of [
    { items: ["0", "1", "2"] },
    { items: ["1", "2"] },
    { items: ["1"], amount: "5" },
    { items: undefined },
    { items: ["1", "1"] },
  ])
    expect(() => currentChildAmount(original, { ...original, ...change })).toThrow(
      "payment_quote_changed",
    );
});
it("does not turn a quoted cached item into paid work", () => {
  expect(() =>
    currentChildAmount(
      { ...original, free: true, items: [], amount: "0" },
      { ...original, items: ["0"] },
    ),
  ).toThrow("payment_quote_changed");
});
