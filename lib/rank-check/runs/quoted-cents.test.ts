import { expect, it } from "vitest";
import { sumQuotedCents } from "./quoted-cents";

it("sums a hosted reservation quote in cents", () => {
  expect(sumQuotedCents({ first: "1.3000", second: "0.5000" })).toBe(1.8);
  expect(sumQuotedCents({})).toBe(0);
  expect(sumQuotedCents(undefined)).toBeUndefined();
});
