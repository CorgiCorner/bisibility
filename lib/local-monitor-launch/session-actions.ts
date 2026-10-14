"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import {
  launchMonitorFor,
  previewMonitorFor,
  readMonitorLaunchFor,
  readMonitorRetryFor,
} from "./service";
/** Session identity is obtained server-side; no caller-supplied actor or provider adapter. */
export async function previewMonitorLaunchAction(input: unknown) {
  return previewMonitorFor(input, { actor: await getActionActor() }, resolveManualLocalDriver);
}
export async function launchMonitorAction(input: unknown) {
  return launchMonitorFor(input, { actor: await getActionActor() });
}
export async function readMonitorLaunchAction(input: unknown) {
  return readMonitorLaunchFor(input, { actor: await getActionActor() });
}

export async function readMonitorRetryAction(input: unknown) {
  return readMonitorRetryFor(input, { actor: await getActionActor() });
}
