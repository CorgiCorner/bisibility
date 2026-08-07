import { describe, expect, it } from "vitest";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { activeDataMigrationImplementations } from "./registry";

describe("data migration registry metadata", () => {
  it("has no active implementation or lifecycle entry after the reset", () => {
    expect(activeDataMigrationImplementations).toEqual([]);
    expect(dataMigrationManifest).toEqual([]);
  });
});
