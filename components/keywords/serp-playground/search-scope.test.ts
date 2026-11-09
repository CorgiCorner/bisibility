import { expect, it } from "vitest";
import { searchLocationLabel } from "./search-scope";

it("shows city and country instead of the duplicated provider hierarchy", () => {
  const run = {
    keyword: {
      id: "",
      text: "hebe",
      device: "desktop" as const,
      locationLabel: "Warsaw,Warsaw,Masovian Voivodeship,Poland",
    },
    search: {
      locationKey: "PL/Warsaw@en",
      locationKind: "city" as const,
      countryCode: "PL",
      language: "en",
    },
  };
  expect(searchLocationLabel(run, "en")).toBe("Warsaw, Poland");
  expect(searchLocationLabel(run, "pl")).toBe("Warsaw, Polska");
});
