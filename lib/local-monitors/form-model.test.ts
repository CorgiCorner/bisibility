import {
  definitionAuthoringSchema,
  definitionInputSchema,
} from "@/lib/local-monitor-store/definition-schema";
import { monitorDefinitionFixture } from "@/lib/local-monitor-store/fixture";
import { describe, expect, it } from "vitest";
import { monitorFormDefaults, monitorFormSchema } from "./form-model";

describe("monitor editor contract", () => {
  it("retains7x7 source geometry but requires a separate larger-grid pilot before authoring", () => {
    const value = {
      ...monitorDefinitionFixture,
      grid: { ...monitorDefinitionFixture.grid, size: 7 },
    };
    expect(definitionInputSchema.safeParse(value).success).toBe(true);
    expect(monitorFormSchema.safeParse(value).success).toBe(false);
  });
  it("requires an explicit subject, keyword and language; never picks the first choice", () => {
    const initial = monitorFormDefaults();
    expect(initial.locationId).toBe("");
    expect(initial.identityRevisionId).toBe("");
    expect(initial.keywordIds).toEqual([]);
    expect(initial.axes.language).toBe("");
    expect(monitorFormSchema.safeParse(initial).success).toBe(false);
  });
  it.each(["latitude", "longitude"] as const)(
    "shares server rejection of excessive %s precision",
    (axis) => {
      const value = {
        ...monitorDefinitionFixture,
        grid: { ...monitorDefinitionFixture.grid, [axis]: "52.12345678" },
      };
      expect(monitorFormSchema).toBe(definitionAuthoringSchema);
      const result = monitorFormSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: ["grid", axis] })]),
        );
    },
  );
  it("preserves exact coordinates and validates surface/rank identity and target caps", () => {
    const value = {
      ...monitorDefinitionFixture,
      grid: { ...monitorDefinitionFixture.grid, latitude: "52.1234567" },
    };
    expect(monitorFormSchema.parse(value).grid.latitude).toBe("52.1234567");
    expect(
      monitorFormSchema.safeParse({ ...value, axes: { ...value.axes, surface: "local_finder" } })
        .success,
    ).toBe(false);
    expect(
      monitorFormSchema.safeParse({ ...value, grid: { ...value.grid, latitude: "91" } }).success,
    ).toBe(false);
    expect(
      monitorFormSchema.safeParse({
        ...value,
        grid: { ...value.grid, size: 7 },
        keywordIds: [
          "kw_abcdefghijklmnopqrstuvwx",
          "kw_bbcdefghijklmnopqrstuvwx",
          "kw_cbcdefghijklmnopqrstuvwx",
        ],
      }).success,
    ).toBe(false);
  });
});
