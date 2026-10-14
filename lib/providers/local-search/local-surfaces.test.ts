import { assertLocalCapability } from "@/lib/local-monitoring/capability";
import { LOCAL_SEARCH_LANGUAGES } from "@/lib/local-monitoring/search-languages";
import { describe, expect, it } from "vitest";
import { mapsCapability, mapsTaskRequest } from "./maps-capability";
import { sumMapsNative } from "./maps-native-quantity";
import { pricedMapsFixture } from "./maps-test-fixtures";
import { localBindingFixture } from "./test-fixtures";

function binding(surface: "maps" | "local_finder", language: string) {
  const value = localBindingFixture(surface);
  return {
    ...value,
    target: {
      ...value.target,
      language,
      rankScale: surface === "maps" ? ("maps_organic" as const) : ("finder_group" as const),
    },
  };
}
describe("registered multilingual local surfaces", () => {
  it("builds both surfaces for every code in the 129-entry provider catalog", () => {
    expect(LOCAL_SEARCH_LANGUAGES).toHaveLength(129);
    expect(new Set(LOCAL_SEARCH_LANGUAGES.map((row) => row.value)).size).toBe(129);
    for (const { value } of LOCAL_SEARCH_LANGUAGES) {
      for (const surface of ["maps", "local_finder"] as const) {
        const scope = binding(surface, value);
        assertLocalCapability(
          scope.target,
          mapsCapability(new Date("2026-10-14T10:00:00.000Z")),
          new Date("2026-10-14T10:00:00.000Z"),
        );
        const request = mapsTaskRequest(scope);
        expect(JSON.parse(String(request.body))[0].language_code).toBe(value);
      }
    }
  });
  it.each(["pl", "es", "ja", "zh-CN"])("admits Maps in catalog language %s", async (language) => {
    const f = await pricedMapsFixture(false, false, binding("maps", language));
    expect(f.priced.admission.outcome).toBe("reserved");
    expect(JSON.parse(String(f.request.body))[0].language_code).toBe(language);
    expect(sumMapsNative([f.priced.estimate])).toEqual([
      { unit: "cents", amount: "0.06" },
      { unit: "requests", amount: "1" },
    ]);
  });
  it.each([1, 10, 11, 20])(
    "admits Finder depth %s using its independent priced operation",
    async (depth) => {
      const value = binding("local_finder", "pl");
      const f = await pricedMapsFixture(false, false, {
        ...value,
        target: { ...value.target, cutoff: depth },
      });
      expect(f.priced.matched.operation).toMatchObject({
        id: "serp.google.local_finder.task_post",
      });
      expect(sumMapsNative([f.priced.estimate])).toEqual([
        { unit: "cents", amount: depth <= 10 ? "0.06" : "0.12" },
        { unit: "requests", amount: "1" },
      ]);
      expect(JSON.parse(String(f.request.body))[0]).not.toHaveProperty("search_this_area");
    },
  );
  it("rejects invented languages and a Maps-only Finder zoom before I/O", () => {
    expect(() => mapsTaskRequest(binding("maps", "xx"))).toThrow();
    const value = binding("local_finder", "pl");
    expect(() => mapsTaskRequest({ ...value, target: { ...value.target, zoom: 21 } })).toThrow();
  });
});
