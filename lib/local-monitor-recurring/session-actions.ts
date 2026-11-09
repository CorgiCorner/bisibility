"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { readRecurringMonitor } from "./read";
import { approveRecurringFor, pauseRecurringFor, previewRecurringFor } from "./service";
export async function readRecurringMonitorAction(projectId: string, monitorId: string) {
  return readRecurringMonitor({ projectId, monitorId }, { actor: await getActionActor() });
}
export async function previewRecurringMonitorAction(input: unknown) {
  return previewRecurringFor(input, { actor: await getActionActor() });
}
export async function approveRecurringMonitorAction(input: unknown) {
  const actor = await getActionActor();
  const result = await approveRecurringFor(input, { actor });
  if (result?.kind === "saved" && !result.replayed) recordAppAction(actor);
  if (result.kind !== "saved") return result;
  const { replayed: _replayed, ...value } = result;
  return value;
}
export async function pauseRecurringMonitorAction(input: unknown) {
  const actor = await getActionActor();
  const result = await pauseRecurringFor(input, { actor });
  if (result?.kind === "saved" && !result.replayed) recordAppAction(actor);
  if (result.kind !== "saved") return result;
  const { replayed: _replayed, ...value } = result;
  return value;
}
