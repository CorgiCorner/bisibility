import { expect, it } from "vitest";
import { hasNotificationResult, hasReceivedRankResult } from "./result-payload";

it.each([
  [{ data: [{ status: "completed", position: null, checked_at: "2026-11-05" }] }, true],
  [{ data: { status: "failed", checked_at: "2026-11-05" } }, false],
  [{ data: { status: "queued" } }, false],
  [{ data: [] }, false],
  [{ status: "completed" }, false],
  [{ data: { last_check_at: "2026-11-05", tracked_keyword_count: 1, top_100_count: 0 } }, true],
  [{ data: { last_check_at: "2026-11-05", tracked_keyword_count: 1, top_100_count: null } }, false],
  [{ data: { latest_successful_check: { checked_at: "2026-11-05", position: null } } }, true],
  [{ hasRankData: true, lastCheckAt: "2026-11-05" }, true],
  [{ tier: "full", checkedAt: "2026-11-05", rows: [] }, false],
  [{ tier: "full", checkedAt: "2026-11-05", rows: [{ position: 1 }] }, true],
])("checks actual returned evidence %j", (value, expected) => {
  expect(hasReceivedRankResult(value)).toBe(expected);
});

it.each([
  ["alert_fired", { afterPosition: 3 }, true],
  ["alert_fired", { afterPosition: 3, test: true }, false],
  ["alert_fired", { afterPosition: null, beforePosition: null }, false],
  ["manual_run_summary", { counts: { new: 1 } }, true],
  ["scheduled_window_summary", { counts: { unchanged: 2 } }, true],
  ["scheduled_window_summary", { counts: { failed: 2, under_review: 1 } }, false],
  ["provider_incident", { counts: { new: 1 } }, false],
])("accepts only delivered result notifications %s %j", (type, payload, expected) => {
  expect(hasNotificationResult(type, payload)).toBe(expected);
});
