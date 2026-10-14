import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export function settingsHash(purpose: string, value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(["measurement-settings-host-v1", purpose, canonical(value)]))
    .digest("hex");
}
/** Actor scope is retained internally; nullable audit attribution never grants replay authority. */
export function settingsActorScope(projectId: string, actorId: string) {
  return settingsHash("actor", { projectId, actorId });
}
