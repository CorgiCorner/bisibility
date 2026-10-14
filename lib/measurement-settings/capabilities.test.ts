import { describe, expect, it } from "vitest";
import { measurementCapability, validateMeasurementOptions } from "./capabilities";

const web = {
  providerId: "dataforseo",
  surface: "web_serp" as const,
  engine: "google",
  device: "mobile",
  locationKind: "city",
  depth: 20,
};

describe("implemented measurement capabilities", () => {
  it("keeps native quota and monetary billing units separate", () => {
    expect(measurementCapability("dataforseo", "web_serp")?.nativeBillingUnit).toBe("cents");
    expect(measurementCapability("serpapi", "web_serp")?.nativeBillingUnit).toBe("searches");
  });
  it("refuses unimplemented surfaces and coordinates rather than degrading them", () => {
    expect(validateMeasurementOptions({ ...web, surface: "maps" })).toEqual({
      supported: false,
      reason: "unsupported_surface",
    });
    expect(
      validateMeasurementOptions({ ...web, coordinates: { latitude: 50, longitude: 20 } }),
    ).toEqual({ supported: false, reason: "unsupported_coordinates" });
    expect(validateMeasurementOptions({ ...web, locationKind: "point" })).toEqual({
      supported: false,
      reason: "unsupported_location",
    });
    expect(validateMeasurementOptions({ ...web, depth: 25 })).toEqual({
      supported: false,
      reason: "unsupported_depth",
    });
    expect(validateMeasurementOptions(web).supported).toBe(true);
  });
});
