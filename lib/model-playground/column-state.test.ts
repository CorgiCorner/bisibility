import { expect, test } from "vitest";
import {
  type AttemptPhase,
  type ColumnEvent,
  type ColumnPhase,
  MODEL_COLUMN_STATES,
  modelColumnState,
  transitionModelColumn,
} from "./column-state";

const phases: AttemptPhase[] = ["admitted", "in_flight", "stale_unknown", "observed", "refused"];
const columns: ColumnPhase[] = ["queued", "claimed", "fenced", "completed", "failed", "expired"];
const events: ColumnEvent[] = [
  "cancel",
  "claim",
  "fence",
  "dispatch",
  "observe",
  "complete",
  "fail",
  "expire",
  "refuse",
];
const edges: Record<string, string> = {
  "refused/queued:cancel": "refused/claimed",
  "refused/claimed:cancel": "refused/claimed",
  "admitted/queued:claim": "admitted/claimed",
  "admitted/queued:refuse": "refused/queued",
  "admitted/claimed:claim": "admitted/claimed",
  "admitted/claimed:fence": "admitted/fenced",
  "admitted/claimed:refuse": "refused/claimed",
  "admitted/fenced:dispatch": "in_flight/fenced",
  "admitted/fenced:refuse": "refused/fenced",
  "in_flight/fenced:observe": "observed/fenced",
  "in_flight/fenced:expire": "stale_unknown/expired",
  "in_flight/expired:observe": "observed/expired",
  "stale_unknown/fenced:observe": "observed/fenced",
  "stale_unknown/fenced:expire": "stale_unknown/expired",
  "stale_unknown/expired:observe": "observed/expired",
  "observed/fenced:complete": "observed/completed",
  "observed/fenced:fail": "observed/failed",
  "observed/expired:complete": "observed/completed",
  "observed/expired:fail": "observed/failed",
  "refused/queued:fail": "refused/failed",
  "refused/claimed:fail": "refused/failed",
  "refused/fenced:fail": "refused/failed",
  "in_flight/fenced:complete": "in_flight/completed",
  "in_flight/fenced:fail": "in_flight/failed",
  "in_flight/expired:complete": "in_flight/completed",
  "in_flight/expired:fail": "in_flight/failed",
  "in_flight/completed:observe": "observed/completed",
  "in_flight/failed:observe": "observed/failed",
  "stale_unknown/fenced:complete": "stale_unknown/completed",
  "stale_unknown/fenced:fail": "stale_unknown/failed",
  "stale_unknown/expired:complete": "stale_unknown/completed",
  "stale_unknown/expired:fail": "stale_unknown/failed",
  "stale_unknown/completed:observe": "observed/completed",
  "stale_unknown/failed:observe": "observed/failed",
};
const legal = new Set([
  "admitted/queued",
  "admitted/claimed",
  "admitted/fenced",
  "in_flight/fenced",
  "in_flight/completed",
  "in_flight/failed",
  "in_flight/expired",
  "stale_unknown/fenced",
  "stale_unknown/completed",
  "stale_unknown/failed",
  "stale_unknown/expired",
  "observed/fenced",
  "observed/completed",
  "observed/failed",
  "observed/expired",
  "refused/queued",
  "refused/claimed",
  "refused/fenced",
  "refused/failed",
]);

test.each(phases.flatMap((attempt) => columns.map((column) => [attempt, column] as const)))(
  "product %s x %s drives all nine events",
  (attempt, column) => {
    const pair = `${attempt}/${column}`;
    const rule = modelColumnState(attempt, column);
    expect(Boolean(rule)).toBe(legal.has(pair));
    for (const event of events) {
      const destination = transitionModelColumn(attempt, column, event);
      expect(destination).toBe(edges[`${pair}:${event}`] ?? null);
      if (destination) expect(legal.has(destination)).toBe(true);
    }
    if (!rule) return;
    const worker =
      attempt === "admitted"
        ? column === "fenced"
          ? "wait"
          : "execute"
        : attempt === "in_flight" && column === "fenced"
          ? "wait"
          : attempt === "stale_unknown" && column === "fenced"
            ? "expire"
            : attempt === "observed" && ["fenced", "expired"].includes(column)
              ? "observe"
              : attempt === "refused" && column !== "failed"
                ? "refuse"
                : "done";
    expect(rule.worker).toBe(worker);
    expect(rule.poll).toBe(
      attempt === "admitted" ||
        (column === "fenced" && (attempt === "in_flight" || attempt === "stale_unknown")),
    );
    const expected =
      attempt === "refused"
        ? "not_started"
        : attempt === "observed" || ["completed", "failed"].includes(column)
          ? "answer"
          : attempt === "admitted"
            ? "waiting"
            : attempt === "in_flight" && column === "fenced"
              ? "running"
              : "uncertain";
    expect(rule.show).toBe(expected);
    expect(MODEL_COLUMN_STATES[attempt][column]).toBe(rule);
  },
);
test("acknowledgement retains unknown and can never dispatch", () => {
  expect(modelColumnState("acknowledged_unknown", "expired")).toMatchObject({
    show: "uncertain",
    poll: false,
  });
  expect(modelColumnState("acknowledged_unknown", "expired")).toEqual(
    modelColumnState("stale_unknown", "expired"),
  );
  expect(modelColumnState("acknowledged_unknown", "expired")?.next.dispatch).toBeUndefined();
});

test.each(phases.flatMap((attempt) => columns.map((column) => [attempt, column] as const)))(
  "safety properties are independent of the enumerated edges: %s/%s",
  (attempt, column) => {
    const dispatch = transitionModelColumn(attempt, column, "dispatch");
    expect(Boolean(dispatch)).toBe(attempt === "admitted" && column === "fenced");
    expect(Boolean(transitionModelColumn(attempt, column, "claim"))).toBe(
      attempt === "admitted" && (column === "queued" || column === "claimed"),
    );
    if (attempt === "refused") {
      expect(transitionModelColumn(attempt, column, "claim")).toBeNull();
      expect(transitionModelColumn(attempt, column, "dispatch")).toBeNull();
      expect(modelColumnState(attempt, column)?.poll ?? false).toBe(false);
    }
    if (attempt === "observed")
      expect(modelColumnState(attempt, column)?.poll ?? false).toBe(false);
  },
);
