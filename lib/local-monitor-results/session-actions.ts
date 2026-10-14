"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { exportLocalRunResult } from "./export";
import { readMonitorRunHistory } from "./history";
import { readMonitorPointHistory } from "./point-history";
import { readMonitorPointListings, readMonitorRunResult } from "./read";
import { localResultExportSchema } from "./schema";
export async function readLocalRunHistoryAction(command: unknown) {
  return readMonitorRunHistory(command, { actor: await getActionActor() });
}
export async function readLocalRunResultAction(command: unknown) {
  return readMonitorRunResult(command, { actor: await getActionActor() });
}
export async function readLocalPointListingsAction(command: unknown) {
  return readMonitorPointListings(command, { actor: await getActionActor() });
}
export async function exportLocalRunResultAction(command: unknown) {
  const { version: _version, format, ...input } = localResultExportSchema.parse(command);
  const report = await readMonitorRunResult(input, { actor: await getActionActor() });
  return exportLocalRunResult(report, format);
}

export async function readLocalPointHistoryAction(command: unknown) {
  return readMonitorPointHistory(command, { actor: await getActionActor() });
}
