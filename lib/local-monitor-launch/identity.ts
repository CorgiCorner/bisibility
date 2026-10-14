import { localQuoteHash } from "@/lib/local-monitoring/quote";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { MonitorLaunchCommand } from "./contracts";
export function occurrenceKey(command: Pick<MonitorLaunchCommand, "monitorId" | "idempotencyKey">) {
  return localDigest([
    "local-monitor-manual-occurrence-v1",
    command.monitorId,
    command.idempotencyKey,
  ]);
}
export function occurrenceBody(
  command: Omit<MonitorLaunchCommand, "consentToken"> & { consentToken?: string },
  actorId: string,
) {
  const { consentToken: _token, quote, targetIds, ...scope } = command;
  return localDigest([
    "local-monitor-manual-body-v1",
    actorId,
    scope,
    [...targetIds].sort(),
    localQuoteHash(quote),
  ]);
}
export function nativeOccurrenceKey(
  command: Pick<MonitorLaunchCommand, "monitorId" | "idempotencyKey">,
) {
  return `local-monitor:${occurrenceKey(command)}`;
}
