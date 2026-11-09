"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import {
  listLocalMonitors,
  readLocalMonitor,
  readLocalMonitorHistory,
} from "@/lib/local-monitor-store/read";
import { monitorRef } from "@/lib/local-monitor-store/schema";
import { projectRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
import type { MonitorCommand } from "./contracts";
import { saveMonitorFor } from "./service";
import { readMonitorSetupChoices } from "./setup-read";

export async function saveMonitorAction(command: MonitorCommand) {
  const actor = await getActionActor();
  const result = await saveMonitorFor(command, { actor });
  if (result?.kind === "saved" && !result.replayed) recordAppAction(actor);
  if (result.kind !== "saved") return result;
  const { replayed: _replayed, ...value } = result;
  return value;
}
export async function readMonitorAction(projectId: string, monitorId: string) {
  return readLocalMonitor({ projectId, monitorId }, { actor: await getActionActor() });
}
export async function listMonitorsAction(
  projectId: string,
  after?: string,
  includeArchived = false,
) {
  const input = z
    .object({ projectId: projectRef, after: monitorRef.optional(), includeArchived: z.boolean() })
    .strict()
    .parse({ projectId, after, includeArchived });
  return listLocalMonitors(
    input.projectId,
    { actor: await getActionActor() },
    { after: input.after, includeArchived: input.includeArchived },
  );
}
export async function readMonitorHistoryAction(
  projectId: string,
  monitorId: string,
  beforeRevision?: number,
) {
  return readLocalMonitorHistory(
    { projectId, monitorId },
    { actor: await getActionActor() },
    { kind: "definition", beforeRevision },
  );
}
export async function searchMonitorChoicesAction(input: {
  projectId: string;
  search: string;
  afterKeyword?: string;
  afterSubject?: string;
}) {
  return readMonitorSetupChoices(input, { actor: await getActionActor() });
}
