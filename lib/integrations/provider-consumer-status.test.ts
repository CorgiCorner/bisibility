import { describe, expect, it } from "vitest";
import { searchModuleConsumerStatus } from "./provider-consumer-status";

describe("searchModuleConsumerStatus", () => {
  const base = {
    accountStatus: "connected" as const,
    completedDays: 37,
    daysTotal: 488,
    firstViewReady: false,
    importState: "running",
    pausedReason: null,
    plannedRetentionMonths: 16,
    property: "sc-domain:corgitocoin.com",
  };

  it("uses durable completed days while a backfill runs", () => {
    expect(searchModuleConsumerStatus(base)).toEqual({
      detail: "corgitocoin.com",
      state: "backfill_running",
      summary: "Backfill running · 37 of ~488 days",
    });
  });

  it("preserves readable URL-prefix properties", () => {
    expect(
      searchModuleConsumerStatus({ ...base, property: "https://example.com/docs/search/" }),
    ).toMatchObject({ detail: "https://example.com/docs/search/" });
  });

  it("distinguishes first-view readiness from full completion", () => {
    expect(searchModuleConsumerStatus({ ...base, firstViewReady: true })).toMatchObject({
      state: "first_view_ready",
      summary: "First 28-day view ready · full history still importing",
    });
  });

  it("uses frozen retention only for a completed import", () => {
    expect(
      searchModuleConsumerStatus({ ...base, completedDays: 488, importState: "completed" }),
    ).toMatchObject({
      state: "kept_current",
      summary: "16 months imported · kept current",
    });
  });

  it("handles user pause, reauthorization, and missing active configuration", () => {
    expect(
      searchModuleConsumerStatus({ ...base, importState: "paused", pausedReason: "user" }),
    ).toMatchObject({ state: "paused_by_user", summary: "Paused by you" });
    expect(searchModuleConsumerStatus({ ...base, accountStatus: "needs_reauth" })).toMatchObject({
      state: "needs_reauth",
      summary: "Needs reconnect",
    });
    expect(searchModuleConsumerStatus({ ...base, property: null })).toEqual({
      state: "not_configured",
      summary: "Not configured",
    });
  });
});
