import { expect, it } from "vitest";
import { keywordViewScopeLabels } from "./view-scope-description";

const labels = {
  allLocations: "All locations",
  selectedLocation: "Selected location",
  allDevices: "All devices",
  desktop: "Desktop",
  mobile: "Mobile",
};
it("names the full project and both devices without relying on view name", () => {
  expect(keywordViewScopeLabels({ locationId: null, device: "all" }, null, [], labels)).toEqual({
    location: "All locations",
    device: "All devices",
  });
});
it("names only the actual selected location, language and device", () => {
  expect(
    keywordViewScopeLabels(
      { locationId: "krakow-pl", device: "mobile" },
      null,
      [
        {
          canonicalKey: "krakow-pl",
          locationId: "location-1",
          displayName: "Kraków",
          languageLabel: "Polski",
        },
        {
          canonicalKey: "warsaw-pl",
          locationId: "location-2",
          displayName: "Warszawa",
          languageLabel: "Polski",
        },
      ],
      labels,
    ),
  ).toEqual({ location: "Kraków / Polski", device: "Mobile" });
});
it("keeps an unknown explicit location distinct from all locations", () => {
  expect(
    keywordViewScopeLabels({ locationId: "removed", device: "desktop" }, null, [], labels),
  ).toEqual({ location: "Selected location", device: "Desktop" });
});
it("keeps the authenticated route's market scope when no explicit lens overrides it", () => {
  expect(
    keywordViewScopeLabels(
      { locationId: null, device: "all" },
      { canonicalKey: "city-pl", ref: "market-a", label: "Kraków / Polski" },
      [],
      labels,
    ),
  ).toEqual({ location: "Kraków / Polski", device: "All devices" });
});
