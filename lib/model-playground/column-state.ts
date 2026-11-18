import type { ModelAttemptState } from "./admission-state";

export type AttemptPhase = Exclude<ModelAttemptState, "acknowledged_unknown">;
export type ColumnPhase = "queued" | "claimed" | "fenced" | "completed" | "failed" | "expired";
export type ColumnEvent =
  | "cancel"
  | "claim"
  | "fence"
  | "dispatch"
  | "observe"
  | "complete"
  | "fail"
  | "expire"
  | "refuse";
type Pair = `${AttemptPhase}/${ColumnPhase}`;
export type ModelWorkerAction = "execute" | "wait" | "expire" | "observe" | "refuse" | "done";
type Rule = {
  worker: ModelWorkerAction;
  show: "waiting" | "running" | "answer" | "not_started" | "uncertain";
  poll: boolean;
  next: Partial<Record<ColumnEvent, Pair>>;
};
const rule = (
  show: Rule["show"],
  poll: boolean,
  next: Rule["next"] = {},
  worker: ModelWorkerAction = "done",
): Rule => ({
  worker,
  show,
  poll,
  next,
});

/** Fenced means claimed + dispatchStartedAt; expired means the stored unknown state.
 * Null pairs are illegal. Claim/fence/dispatch commit atomically; refusal rolls them back.
 * A paid observation wins over lease expiry and is never dispatched again.
 * Run columns | delivery state | worker polling | supplementary hook
 * queued/claimed | active | SQL attempts + backoff, transient failures retry | none
 * unstarted + give-up | recoveryStoppedAt | refuse reservation_unavailable, no dispatch | finalize
 * fenced + give-up | recoveryStoppedAt | recovery-only sweep: expire/observe, never execute | finalize when terminal
 * all terminal | terminalAt, revision > delivered | stop | integer claim, five failures per revision
 * all terminal | revision = delivered | stop | no-op, including duplicates
 * terminal + receipt/accounting change | terminalAt retained, revision + 1 | stop | pending refresh after settlement
 * hook attempts exhausted | stoppedAt set, stoppedRevision = terminalRevision, delivered < revision | stop | give-up for that revision; only an exhausted budget resets
 * Given up means the stop timestamp is set, the stopped revision equals the current revision, and delivery is still behind. A newer delivered revision leaves the timestamp set.
 * legacy terminal | revision = delivered | stop | no historical report creation
 * inline fenced, no worker | flag off, both process entries schedule the sweep | expire or terminalize, never start | no paid call
 * stale fenced, lease live | show uncertain and keep polling | expire only after the lease ends | a late answer is still retained
 * hook installed | registration sets the report finaliser once | both process entries import it | create or refresh; a hold undoes only that claim
 * in-flight settle | accounting first | a crash in the meter transaction leaves the column unanswered until recovery replays the durable evidence | receipt follows
 * receipt terminalize | errors logged by name only | the sweep terminalizes a finished inline run | settled result stands
 * Historical measurement functions that pin search_path to public are a known pre-existing defect. This schema does not change their runtime path.
 * A persistently throwing stopped-branch finalize is bounded by the sweep.
 * Hooks rebuild current columns for newer revisions and acknowledge only the delivered revision.
 * Hook calls own their transactions; a failed hook cannot undo terminalAt or a paid answer.
 * Report division: hook delivery creates a report and refreshes it after a revision bump.
 * The report sweep is the third isolated recovery step. It repairs saved_stale storage and retries failed storage creation after the backoff, following next until null, at most 20 pages (1000 rows) per tick. A throw before save or inside save records the storage backoff, and that write requires the share-locked project mode to be active, so a failing row cannot stay at the head. It does not create a none row or refresh a current saved report.
 * A held project makes hook delivery, recovery, and the registered finaliser return held: no report write and no acknowledgement. Only the user save action opts into alreadySaved for a linked report, with that id and no refresh. An unlinked save returns read_only. The attempt base increases by one and the next attempt waits five minutes, so only this claim is undone. Non-active projects are excluded from the hook batch. The counter cannot decrease.
 * Dismissed and unclassified runs acknowledge the revision and write no report. Explicit save still classifies unclassified.
 * A not-ready report throws, so that claim counts as a failure and is not acknowledged.
 * 20261113200000_model_playground_report_delete sorts before 20261113200000_model_playground_worker_delivery. report_delete only replaces the run guard so deletion can unlink reportId. worker_delivery only adds worker, terminal and hook columns, checks, indexes, the historical delivered backfill, and the delivery and column guards. Neither depends on the other.
 */
export const MODEL_COLUMN_STATES: Record<AttemptPhase, Record<ColumnPhase, Rule | null>> = {
  admitted: {
    queued: rule(
      "waiting",
      true,
      { claim: "admitted/claimed", refuse: "refused/queued" },
      "execute",
    ),
    claimed: rule(
      "waiting",
      true,
      {
        claim: "admitted/claimed",
        fence: "admitted/fenced",
        refuse: "refused/claimed",
      },
      "execute",
    ),
    fenced: rule(
      "waiting",
      true,
      { dispatch: "in_flight/fenced", refuse: "refused/fenced" },
      "wait",
    ),
    completed: null,
    failed: null,
    expired: null,
  },
  in_flight: {
    queued: null,
    claimed: null,
    fenced: rule(
      "running",
      true,
      {
        observe: "observed/fenced",
        expire: "stale_unknown/expired",
        complete: "in_flight/completed",
        fail: "in_flight/failed",
      },
      "wait",
    ),
    completed: rule("answer", false, { observe: "observed/completed" }),
    failed: rule("answer", false, { observe: "observed/failed" }),
    expired: rule("uncertain", false, {
      observe: "observed/expired",
      complete: "in_flight/completed",
      fail: "in_flight/failed",
    }),
  },
  stale_unknown: {
    queued: null,
    claimed: null,
    fenced: rule(
      "uncertain",
      true,
      {
        observe: "observed/fenced",
        expire: "stale_unknown/expired",
        complete: "stale_unknown/completed",
        fail: "stale_unknown/failed",
      },
      "expire",
    ),
    completed: rule("answer", false, { observe: "observed/completed" }),
    failed: rule("answer", false, { observe: "observed/failed" }),
    expired: rule("uncertain", false, {
      observe: "observed/expired",
      complete: "stale_unknown/completed",
      fail: "stale_unknown/failed",
    }),
  },
  observed: {
    queued: null,
    claimed: null,
    fenced: rule(
      "answer",
      false,
      { complete: "observed/completed", fail: "observed/failed" },
      "observe",
    ),
    completed: rule("answer", false),
    failed: rule("answer", false),
    expired: rule(
      "answer",
      false,
      { complete: "observed/completed", fail: "observed/failed" },
      "observe",
    ),
  },
  refused: {
    queued: rule(
      "not_started",
      false,
      { cancel: "refused/claimed", fail: "refused/failed" },
      "refuse",
    ),
    claimed: rule(
      "not_started",
      false,
      { cancel: "refused/claimed", fail: "refused/failed" },
      "refuse",
    ),
    fenced: rule("not_started", false, { fail: "refused/failed" }, "refuse"),
    completed: null,
    failed: rule("not_started", false),
    expired: null,
  },
};
/** A stop timestamp alone is not give-up: a newer revision may already have been delivered. */
export function modelTerminalHookGivenUp(row: {
  stoppedAt: Date | null;
  stoppedRevision: number;
  terminalRevision: number;
  deliveredRevision: number;
}) {
  return (
    row.stoppedAt !== null &&
    row.stoppedRevision === row.terminalRevision &&
    row.deliveredRevision < row.terminalRevision
  );
}

export function modelColumnState(attempt: ModelAttemptState, column: ColumnPhase) {
  return MODEL_COLUMN_STATES[attempt === "acknowledged_unknown" ? "stale_unknown" : attempt][
    column
  ];
}
export function transitionModelColumn(
  attempt: ModelAttemptState,
  column: ColumnPhase,
  event: ColumnEvent,
): Pair | null {
  return modelColumnState(attempt, column)?.next[event] ?? null;
}
export function storedColumnPhase(column: {
  state: string;
  dispatchStartedAt: Date | null;
  result?: unknown;
}): ColumnPhase {
  if (column.state === "queued") return "queued";
  if (column.state === "claimed") return column.dispatchStartedAt ? "fenced" : "claimed";
  if (column.state === "unknown") return column.result ? "failed" : "expired";
  return ["completed", "partial"].includes(column.state) ? "completed" : "failed";
}

export function requireModelColumnTransition(
  attempt: ModelAttemptState,
  column: ColumnPhase,
  event: ColumnEvent,
) {
  const next = transitionModelColumn(attempt, column, event);
  if (!next) throw new ModelColumnTransitionError(`${attempt}/${column}:${event}`);
  return next;
}

export class ModelColumnTransitionError extends Error {}
