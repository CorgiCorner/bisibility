import { describe, expect, it } from "vitest";
import {
  classifyGotoHistoryCandidate,
  GOTO_HISTORY_SOURCE_WINDOW_MS,
  type GotoHistoryCandidate,
} from "./goto-history-eligibility";
import { QUEUED_SOURCE_FAILED_RETENTION_MS } from "./queued-source-retention";

const now = new Date("2026-11-03T12:00:00.000Z");
const recent = new Date("2026-10-31T12:00:00.000Z");
const expired = new Date(now.getTime() - GOTO_HISTORY_SOURCE_WINDOW_MS - 1);

function candidate(overrides: Partial<GotoHistoryCandidate> = {}): GotoHistoryCandidate {
  return {
    attempts: [],
    connectionId: "connection",
    connectionMatches: true,
    error: null,
    errorCode: "provider_unresolved_redirects",
    finishedAt: recent,
    now,
    operatorReviewPartial: false,
    providerTaskId: "task",
    raw: null,
    recoveryRestoredAt: null,
    retainedSource: true,
    run: { deletedAt: null, status: "failed" },
    status: "failed",
    taskCreatedAt: recent,
    ...overrides,
  };
}

describe("classifyGotoHistoryCandidate", () => {
  it("uses the same source window as retained queued evidence", () => {
    expect(GOTO_HISTORY_SOURCE_WINDOW_MS).toBe(QUEUED_SOURCE_FAILED_RETENTION_MS);
  });

  it.each([
    ["retained redirect failure", {}, "eligible_retained"],
    [
      "stored anomaly with a recent task and no retained source",
      {
        error: null,
        errorCode: null,
        raw: {
          normalization: { anomalies: [{ code: "organic_result_unclassifiable", index: 1 }] },
        },
        retainedSource: false,
      },
      "eligible_task_get",
    ],
    [
      "exact anomaly token plus a recent task",
      {
        error: "DataForSEO organic payload is indeterminate: organic_result_unclassifiable",
        errorCode: null,
        retainedSource: false,
      },
      "eligible_task_get",
    ],
    [
      "operator review partial evidence",
      {
        error: null,
        errorCode: null,
        operatorReviewPartial: true,
        providerTaskId: null,
        retainedSource: false,
      },
      "eligible_requalify",
    ],
    ["completed winner", { status: "completed" }, "not_eligible_completed"],
    ["already restored", { recoveryRestoredAt: now }, "not_eligible_completed"],
    ["cancelled run", { run: { deletedAt: null, status: "cancelled" } }, "not_eligible_run"],
    ["cancelling run", { run: { deletedAt: null, status: "cancelling" } }, "not_eligible_run"],
    ["deleted run", { run: { deletedAt: now, status: "failed" } }, "not_eligible_run"],
    ["missing run", { run: null }, "not_eligible_run"],
    [
      "error string alone",
      {
        error: "organic_result_unclassifiable",
        errorCode: null,
        providerTaskId: null,
        retainedSource: false,
      },
      "not_eligible_no_source",
    ],
    [
      "vague redirect prose with a fresh task",
      {
        error: "redirects that could not be resolved",
        errorCode: null,
        retainedSource: false,
      },
      "not_eligible_not_goto",
    ],
    [
      "different anomaly",
      {
        errorCode: null,
        raw: { anomalies: [{ code: "organic_rank_missing", index: 0 }] },
        retainedSource: false,
      },
      "not_eligible_not_goto",
    ],
    ["expired task id", { retainedSource: false, taskCreatedAt: expired }, "not_eligible_expired"],
    [
      "task on another connection",
      { connectionMatches: false, retainedSource: false },
      "not_eligible_account",
    ],
    [
      "redirect code without a source",
      { providerTaskId: null, retainedSource: false },
      "not_eligible_no_source",
    ],
  ] as const)("%s", (_name, overrides, expected) => {
    expect(classifyGotoHistoryCandidate(candidate(overrides))).toBe(expected);
  });
});
