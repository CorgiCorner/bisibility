import { describe, expect, it } from "vitest";
import { dataForSeoLabsLocationParams } from "./dataforseo-client";

describe("DataForSEO Labs location parameters", () => {
  it("uses the country handle while preserving the selected language", () => {
    expect(
      dataForSeoLabsLocationParams({
        gl: "es",
        hl: "ca",
        primaryGeoCode: 12_345,
        primaryGeoName: "Barcelona, Spain",
        secondaryGeoName: "Barcelona, Catalonia, Spain",
      }),
    ).toEqual({ language_code: "ca", location_name: "Spain" });
  });
});
