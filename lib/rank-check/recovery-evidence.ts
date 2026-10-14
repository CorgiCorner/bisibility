import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { z } from "zod";
import type { RankCheckPersistTarget } from "./runner-persistence-types";
import type { RankCheckRunResult } from "./runner-result";

const DAY = 86400000;
const envelope = z.object({
  version: z.literal(1),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  target: z.object({
    keywordId: z.string(),
    projectId: z.string(),
    queuedTaskId: z.string().nullable(),
    expectedUrlAtCheck: z.string().nullable(),
    attempts: z.array(z.object({ provider: z.string(), message: z.string() })),
  }),
  result: z
    .object({
      definitionBindingId: z.string().nullable().optional(),
      rankCheck: z
        .object({
          keywordId: z.string(),
          provider: z.string(),
          checkedAt: z.iso.datetime(),
          requestedDepth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
          position: z.number().int().nullable(),
          previousPosition: z.number().int().nullable(),
          rankingUrl: z.string().nullable(),
          normalizationVersion: z.string(),
          organicRanks: z.array(z.object({ domain: z.string(), position: z.number() })).nullable(),
          raw: z.record(z.string(), z.unknown()).nullable(),
          observation: z.unknown().optional(),
          billingUnits: z.number().nullable(),
          costCents: z.number().nullable(),
          estimatedCostCents: z.number().nullable(),
        })
        .passthrough(),
    })
    .passthrough(),
});
export type RetainedRankResult = z.infer<typeof envelope>;
function digest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}
export class RetainedRankResultUnreadableError extends Error {}

/** Retain before the product transaction; a rollback must leave the result available. */
export async function retainRankResult(target: RankCheckPersistTarget, result: RankCheckRunResult) {
  if (!target.existingRankCheckId || !result.recoveryContextHash) return false;
  if ((target.persistenceGuard || target.persistenceFinalize) && !target.queuedTaskId) return false;
  const value = {
    version: 1,
    contextHash: result.recoveryContextHash,
    target: {
      keywordId: target.keywordId,
      projectId: target.projectId,
      queuedTaskId: target.queuedTaskId ?? null,
      expectedUrlAtCheck: target.expectedUrlAtCheck ?? target.keywordTargetUrl ?? null,
      attempts: target.attempts ?? [],
    },
    result,
  };
  const body = JSON.stringify(value);
  envelope.parse(JSON.parse(body));
  if (Buffer.byteLength(body) > 4 * 1024 * 1024)
    throw new Error("Rank result exceeds recovery retention limit");
  await prisma.rankCheckResultEvidence.createMany({
    data: {
      namespace: meteringNamespace(),
      instanceId: recoveryInstance(),
      rankCheckId: target.existingRankCheckId,
      identityHash: digest(body),
      payloadEncrypted: encryptSecret(body),
      expiresAt: new Date(Date.now() + 7 * DAY),
    },
    skipDuplicates: true,
  });
  return true;
}
export function decodeRankResult(row: {
  schemaVersion: number;
  payloadEncrypted: string;
  identityHash: string;
}) {
  try {
    if (row.schemaVersion !== 1) throw new Error();
    const body = decryptSecret(row.payloadEncrypted);
    if (digest(body) !== row.identityHash) throw new Error();
    return envelope.parse(JSON.parse(body));
  } catch {
    throw new RetainedRankResultUnreadableError("Retained rank result is unreadable");
  }
}
export async function consumeRankResult(tx: Prisma.TransactionClient, rankCheckId: string) {
  await tx.rankCheckResultEvidence.deleteMany({ where: { rankCheckId } });
}
