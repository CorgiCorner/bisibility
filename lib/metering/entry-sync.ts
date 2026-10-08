import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence";
import type { UsageEntry } from "./mapping";
import { persistQueuedHandoff } from "./queued-payload";
import { shadowForProject } from "./shadow-runtime";

export async function loadUsageEntry(id: string): Promise<UsageEntry | null> {
  return loadByokEvidence(prisma, id);
}
export async function syncUsageEntry(id: string) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await loadUsageEntry(id);
    if (!entry) return;
    if (await ownAdmission.owns(prisma, id)) return;
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
    await shadow?.record(entry);
  } catch {
    console.warn("[metering] receipt synchronization failed", { operationId: id });
  }
}
export async function beginUsageEntry(
  id: string,
  estimate: { cents: string; units: string },
  queued = false,
) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await loadUsageEntry(id);
    if (!entry) return;
    if (await ownAdmission.owns(prisma, id)) return;
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
    await shadow?.begin(entry, estimate, queued ? 86400000 : 3600000);
    if (queued && entry.correlationId)
      await persistQueuedHandoff(entry.correlationId, shadow?.handoff(id));
  } catch {
    console.warn("[metering] receipt admission failed", { operationId: id });
  }
}
