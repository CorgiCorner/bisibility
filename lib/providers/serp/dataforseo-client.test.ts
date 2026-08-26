import { describe, expect, it } from "vitest";
import { dataForSeoLabsLocationParams, extractDataForSeoBalance } from "./dataforseo-client";

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

describe("DataForSEO balance extraction", () => {
  it("reads the nested money balance returned by user_data", () => {
    expect(
      extractDataForSeoBalance({ tasks: [{ result: [{ money: { balance: 41.2, total: 100 } }] }] }),
    ).toBe(41.2);
  });

  it("keeps compatibility with direct balance shapes", () => {
    expect(extractDataForSeoBalance({ tasks: [{ result: [{ balance: 12.5 }] }] })).toBe(12.5);
    expect(extractDataForSeoBalance({ balance: 8.75 })).toBe(8.75);
  });
});
