import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { expect } from "vitest";
import { z } from "zod";
/** Probe raw writes against the actual deferred SQL authority, with all unrelated fields valid. */
export async function assertRetrySqlNegatives(db: LocalDatabase, sourceId: string) {
  const source = await db.localMonitorLaunchIntent.findUniqueOrThrow({ where: { id: sourceId } });
  const command = z.record(z.string(), z.json()).parse(source.command),
    retry = z.record(z.string(), z.json()).parse(command.retry);
  for (const invalid of [
    { parentRunId: null },
    { sourceHash: null },
    { selectedProofHash: null },
    { parentExpectedCount: null },
    { parentExpectedCount: String(retry.parentExpectedCount) },
    { targetIds: [] },
  ]) {
    await expect(
      db.$transaction(async (tx) => {
        const id = randomUUID();
        await tx.localMonitorLaunchIntent.create({
          data: {
            id,
            publicId: makePublicId("lmj"),
            projectId: source.projectId,
            monitorId: source.monitorId,
            actorId: source.actorId,
            command: { ...command, retry: { ...retry, ...invalid } },
            bodyHash: source.bodyHash,
            keyHash: localDigest(id),
            connectionStamp: source.connectionStamp,
            consentDigest: source.consentDigest,
            approvedAt: source.approvedAt,
            expiresAt: source.expiresAt,
            collectionDeadline: source.collectionDeadline,
            pollIntervalMs: source.pollIntervalMs,
          },
        });
        await tx.$executeRaw`INSERT INTO local_monitor_retry_selections SELECT ${id},"projectId","monitorId","parentRunId","parentOccurrenceId","definitionRevisionId","scheduleIntentId","parentExpectedCount","sourceHash","selectedProofHash","createdAt" FROM local_monitor_retry_selections WHERE id=${sourceId}`;
        await tx.$executeRaw`INSERT INTO local_monitor_retry_members SELECT ${id},"projectId","parentItemId","targetId","targetKey","recordVersion","recordSnapshot","nativeState","nativeProof" FROM local_monitor_retry_members WHERE "selectionId"=${sourceId}`;
      }),
    ).rejects.toThrow(/Monitor retry frozen selection mismatch/);
  }
}
