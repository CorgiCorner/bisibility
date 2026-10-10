import type { JsonValue } from "@/lib/ai-tracking/contract";

export type TrackingTask = {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  data?: Record<string, JsonValue>;
  result?: Array<Record<string, JsonValue>> | null;
};
export type TrackingEnvelope = {
  status_code?: number;
  cost?: number;
  tasks?: TrackingTask[];
};
export function object(value: unknown): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}
export function array(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
export function text(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}
export function taskOutcome(envelope: TrackingEnvelope) {
  const task = envelope.tasks?.[0];
  if (envelope.status_code !== 20000 || !task) return "unknown";
  if ([20100, 40601, 40602].includes(task.status_code ?? 0)) return "pending";
  if (task.status_code !== 20000) return "failed";
  return Array.isArray(task.result) ? "ready" : "unknown";
}
