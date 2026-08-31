import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import { describe, expect, it } from "vitest";

describe("resolveSearchSyncSettings", () => {
  it("uses strict self-host defaults when project overrides are unset", () => {
    expect(
      resolveSearchSyncSettings(null, {
        SEARCH_SYNC_IMPORT_MONTHS: "12",
        SEARCH_SYNC_PACE: "gentle",
      }),
    ).toEqual({ retentionMonths: 12, pace: "gentle" });
  });

  it("falls back safely for invalid operator values", () => {
    expect(
      resolveSearchSyncSettings(null, { SEARCH_SYNC_IMPORT_MONTHS: "9", SEARCH_SYNC_PACE: "fast" }),
    ).toEqual({ retentionMonths: 16, pace: "normal" });
  });

  it("prefers project overrides over operator defaults", () => {
    expect(
      resolveSearchSyncSettings(
        { searchSyncImportMonths: 6, searchSyncPace: "normal" },
        { SEARCH_SYNC_IMPORT_MONTHS: "12", SEARCH_SYNC_PACE: "gentle" },
      ),
    ).toEqual({ retentionMonths: 6, pace: "normal" });
  });
});
