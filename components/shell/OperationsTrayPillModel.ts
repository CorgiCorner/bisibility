import type { OperationsTrayPill, TrayOperation } from "./OperationsTrayModel.types";

export function labelForPill(operations: readonly TrayOperation[]): OperationsTrayPill {
  const attention = operations.filter((operation) => operation.attention !== null);
  if (operations.length === 0) {
    return { kind: "idle" };
  }
  if (attention.length === 0) {
    const executing = operations.filter((operation) => operation.lifecycle === "executing");
    if (executing.length > 0) {
      return { count: executing.length, kind: "busy", tone: "info", word: "running" };
    }
    const waiting = operations.filter((operation) => operation.lifecycle === "waiting");
    if (waiting.length > 0) {
      return { count: waiting.length, kind: "busy", tone: "info", word: "waiting" };
    }
    return { kind: "idle" };
  }
  const hasFailure = attention.some((operation) => operation.attention === "critical");
  return {
    count: attention.length,
    kind: "busy",
    tone: hasFailure ? "critical" : "attention",
    word: hasFailure
      ? "failed"
      : attention.every((operation) => operation.blocked)
        ? "blocked"
        : "waiting",
  };
}
