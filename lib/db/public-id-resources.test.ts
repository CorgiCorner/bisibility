import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { activeDataMigrationImplementations } from "@/scripts/data-migrations/registry";
import { computeDataMigrationChecksum } from "@/scripts/data-migrations/resolver";
import { describe, expect, it } from "vitest";
import * as core from "./public-id";
import {
  isPublicIdOfType,
  isValidPublicId,
  makePublicId,
  PUBLIC_ID_RESOURCE_REGISTRY,
  parsePublicId,
  parsePublicIdOfType,
  requirePublicId,
} from "./public-id-resources";

describe("runtime public ID resource extensions", () => {
  it("preserves every original resource and parser result without mutating the core registry", () => {
    expect(PUBLIC_ID_RESOURCE_REGISTRY).toEqual({
      ...core.PUBLIC_ID_RESOURCE_REGISTRY,
      agr: "agentReport",
      ait: "aiTopic",
      aip: "aiPrompt",
      apr: "aiPromptRevision",
      ais: "aiTrackingSchedule",
      air: "aiTrackingRun",
      asm: "aiTrackingSample",
      asg: "aiTrackingSuggestionGeneration",
    });
    expect(core.PUBLIC_ID_RESOURCE_REGISTRY).not.toHaveProperty("agr");
    for (const prefix of Object.keys(core.PUBLIC_ID_RESOURCE_REGISTRY) as core.PublicIdPrefix[]) {
      const id = makePublicId(prefix);
      expect(parsePublicId(id)).toEqual(core.parsePublicId(id));
      expect(requirePublicId(id, prefix)).toBe(id);
    }
  });

  it("generates strict report IDs and resolves them only as reports", () => {
    const ids = new Set(Array.from({ length: 100 }, () => makePublicId("agr")));
    expect(ids.size).toBe(100);
    for (const id of ids) {
      expect(id).toMatch(/^agr_[a-z][a-z0-9]{23}$/);
      expect(parsePublicId(id)).toEqual({
        prefix: "agr",
        resource: "agentReport",
        suffix: id.slice(4),
        value: id,
      });
      expect(isValidPublicId(id)).toBe(true);
      expect(isPublicIdOfType(id, "agr")).toBe(true);
      expect(parsePublicIdOfType(id, "prj")).toBeNull();
      expect(core.parsePublicId(id)).toBeNull();
    }
  });

  it.each(["ait", "aip", "apr", "ais", "air", "asm", "asg"] as const)(
    "generates strict tracking resource IDs: %s",
    (prefix) => {
      const id = makePublicId(prefix);
      expect(parsePublicId(id)?.prefix).toBe(prefix);
      expect(requirePublicId(id, prefix)).toBe(id);
      expect(core.parsePublicId(id)).toBeNull();
      expect(parsePublicId(`${prefix}_legacy`)).toBeNull();
    },
  );

  it.each([
    "agr_legacy",
    "agr_Abcdefghijklmnopqrstuvwx",
    "agr_1bcdefghijklmnopqrstuvwx",
    "agr_abcdefghijklmnopqrstuvwx_suffix",
    "AGR_abcdefghijklmnopqrstuvwx",
    " agr_abcdefghijklmnopqrstuvwx",
    "agr_abcdefghijklmnopqrstuvwx ",
    "unknown_abcdefghijklmnopqrstuvwx",
  ])("rejects malformed or unsupported IDs: %s", (value) => {
    expect(parsePublicId(value)).toBeNull();
    expect(() => requirePublicId(value, "agr")).toThrow("strict agr_");
  });

  it("keeps actual immutable migration input checksums equal to the unchanged manifest", async () => {
    makePublicId("agr");
    for (const implementation of activeDataMigrationImplementations) {
      const entry = dataMigrationManifest.find((item) => item.id === implementation.id);
      expect(entry).toBeDefined();
      expect(await computeDataMigrationChecksum(implementation)).toBe(entry?.checksum);
    }
  });
});
