"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { readRecurringMonitor } from "./read";
import { approveRecurringFor, pauseRecurringFor, previewRecurringFor } from "./service";
export async function readRecurringMonitorAction(projectId: string, monitorId: string) {
  return readRecurringMonitor({ projectId, monitorId }, { actor: await getActionActor() });
}
export async function previewRecurringMonitorAction(input: unknown) {
  return previewRecurringFor(input, { actor: await getActionActor() });
}
export async function approveRecurringMonitorAction(input: unknown) {
  return approveRecurringFor(input, { actor: await getActionActor() });
}
export async function pauseRecurringMonitorAction(input: unknown) {
  return pauseRecurringFor(input, { actor: await getActionActor() });
}
