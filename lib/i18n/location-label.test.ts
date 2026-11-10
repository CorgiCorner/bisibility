import { expect, it } from "vitest";
import { compactLocationLabel, localizedLocationLabel } from "./location-label";

it("compacts repeated provider geography without dropping the country", () => {
  expect(compactLocationLabel("Warsaw,Warsaw,Masovian Voivodeship,Poland")).toBe("Warsaw, Poland");
  expect(compactLocationLabel("United States")).toBe("United States");
  expect(compactLocationLabel("Brighton, United Kingdom")).toBe("Brighton, United Kingdom");
});

it("localizes a compact city field while retaining its canonical source label", () => {
  const value = {
    kind: "city" as const,
    displayName: "Warsaw,Warsaw,Masovian Voivodeship,Poland",
    countryCode: "PL",
  };
  expect(localizedLocationLabel(value, "en")).toBe("Warsaw, Poland");
  expect(localizedLocationLabel(value, "pl")).toBe("Warsaw, Polska");
  expect(value.displayName).toBe("Warsaw,Warsaw,Masovian Voivodeship,Poland");
});
