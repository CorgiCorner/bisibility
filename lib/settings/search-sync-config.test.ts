import {
  resolveSearchSyncSettings,
  searchSyncPaceLabel,
  searchSyncPreflightEstimate,
  searchSyncRetentionLabel,
} from "@/lib/settings/search-sync-config";
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

  it("presents shared labels and the connection estimate", () => {
    const settings = { pace: "normal" as const, retentionMonths: 3 as const };

    expect(searchSyncRetentionLabel(settings.retentionMonths)).toBe("3 months");
    expect(searchSyncPaceLabel(settings.pace)).toBe("Standard");
    expect(searchSyncPreflightEstimate(settings)).toBe(
      "Importing 3 months takes about 400 requests to Google. First view in ~5 min; full history in ~9 hours at Standard speed.",
    );
  });
});
