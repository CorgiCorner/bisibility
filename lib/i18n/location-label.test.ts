import { expect, it } from "vitest";
import { compactLocationLabel } from "./location-label";

it("compacts repeated provider geography without dropping the country", () => {
  expect(compactLocationLabel("Warsaw,Warsaw,Masovian Voivodeship,Poland")).toBe("Warsaw, Poland");
  expect(compactLocationLabel("United States")).toBe("United States");
  expect(compactLocationLabel("Brighton, United Kingdom")).toBe("Brighton, United Kingdom");
});
