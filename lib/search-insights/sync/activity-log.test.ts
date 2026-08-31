import { describe, expect, it } from "vitest";
import {
  formatDayComplete,
  formatPartitionStored,
  formatSyncComplete,
  formatSyncFailed,
  formatSyncPaused,
  formatSyncResumed,
} from "./activity-log";

describe("Search Insights activity log format", () => {
  it.each([
    [["query"] as const, 0, "[sync] gsc day 2026-08-12 · dims query · stored 0 rows"],
    [["page"] as const, 1, "[sync] gsc day 2026-08-12 · dims page · stored 1 rows"],
    [
      ["query", "page"] as const,
      1_240,
      "[sync] gsc day 2026-08-12 · dims query-page · stored 1,240 rows",
    ],
  ])("formats %j with an exact durable row count", (dimensions, storedRows, expected) => {
    expect(formatPartitionStored({ date: "2026-08-12", dimensions, storedRows })).toBe(expected);
  });

  it("formats day completion and every durable state transition", () => {
    expect(formatDayComplete("2026-08-12")).toBe("[sync] gsc day 2026-08-12 · complete (3/3 sets)");
    expect(formatSyncPaused({ reason: "quota", stream: "backfill" })).toBe(
      "[sync] backfill paused · reason quota · resumes automatically",
    );
    expect(formatSyncPaused({ reason: "authorization", stream: "backfill" })).toBe(
      "[sync] backfill paused · reason authorization · reconnect required",
    );
    expect(formatSyncPaused({ reason: "user", stream: "backfill" })).toBe(
      "[sync] backfill paused · reason user · resumes manually",
    );
    expect(formatSyncPaused({ reason: "error", stream: "backfill" })).toBe(
      "[sync] backfill paused · reason error · retry manually",
    );
    expect(formatSyncResumed({ reason: "user", stream: "backfill" })).toBe(
      "[sync] backfill resumed · reason user",
    );
    expect(formatSyncResumed({ reason: "quota", stream: "incremental" })).toBe(
      "[sync] incremental resumed · reason quota",
    );
    expect(formatSyncComplete("backfill")).toBe("[sync] backfill complete");
    expect(formatSyncFailed({ failureClass: "provider_5xx", stream: "backfill" })).toBe(
      "[sync] backfill failed · reason provider-5xx",
    );
  });

  it("has no API surface for sensitive identifiers and never invents them", () => {
    const sensitive = ["sc-domain:private.example", "project_secret_123", "refresh_token_secret"];
    const messages = [
      formatPartitionStored({ date: "2026-08-12", dimensions: ["query"], storedRows: 1 }),
      formatDayComplete("2026-08-12"),
      formatSyncPaused({ reason: "authorization", stream: "backfill" }),
      formatSyncFailed({ failureClass: "auth", stream: "incremental" }),
    ];
    expect(messages.join(" ")).not.toContain(sensitive[0]);
    expect(messages.join(" ")).not.toContain(sensitive[1]);
    expect(messages.join(" ")).not.toContain(sensitive[2]);
  });
});
