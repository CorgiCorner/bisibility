import { dataTableRowHeight } from "@/components/ui/data-table/data-table-density";
import { describe, expect, it } from "vitest";
import { persistKeywordGridDensity } from "./grid-density";

describe("keyword table density", () => {
  it("uses the shared table row-height scale", () => {
    expect(dataTableRowHeight("compact")).toBe(56);
    expect(dataTableRowHeight("standard")).toBe(68);
    expect(dataTableRowHeight("comfortable")).toBe(78);
  });

  it("persists the server-readable density cookie", () => {
    persistKeywordGridDensity("compact");

    expect(document.cookie).toContain("pref_density=compact");
  });
});
