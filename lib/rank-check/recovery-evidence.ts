import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import type { z } from "zod";
import {
  retainedRankResultEnvelope,
  retainedRankResultEnvelopeV1,
} from "./recovery-evidence-envelope";
import type { RankCheckPersistTarget } from "./runner-persistence-types";
import type { RankCheckRunResult } from "./runner-result";

const DAY = 86400000;
const envelope = retainedRankResultEnvelopeV1;
export type RetainedRankResult = z.infer<typeof retainedRankResultEnvelopeV1>;
function digest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}
export class RetainedRankResultUnreadableError extends Error {}
export class RetainedRankResultUnsupportedError extends Error {}

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
    const body = decryptSecret(row.payloadEncrypted);
    if (digest(body) !== row.identityHash) throw new Error();
    const value = retainedRankResultEnvelope.parse(JSON.parse(body));
    if (value.version !== row.schemaVersion) throw new Error();
    if (
      value.version === 2 &&
      (value.completeness !== "complete" || !value.operationPk || !value.attemptId)
    )
      throw new RetainedRankResultUnsupportedError(
        "Retained rank result version is not yet supported",
      );
    return value;
  } catch (error) {
    if (error instanceof RetainedRankResultUnsupportedError) throw error;
    throw new RetainedRankResultUnreadableError("Retained rank result is unreadable");
  }
}
export async function consumeRankResult(tx: Prisma.TransactionClient, rankCheckId: string) {
  await tx.rankCheckResultEvidence.deleteMany({ where: { rankCheckId } });
}
