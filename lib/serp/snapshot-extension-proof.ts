import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { sameDefinitionBytes } from "@/lib/measurement-definitions/canonical";
import { readSnapshotContinuation, readSnapshotExtension } from "./snapshot-extension-state";

type ProofCheck = { id: string; keywordId: string; provider: string; raw: unknown };
type ProofRow = { binding: unknown; prepared: bigint; dispatched: bigint; intents: bigint };

/** Caller holds the project/check lock also used by request preparation and dispatch. */
export async function snapshotExtensionWasNotSent(
  tx: Prisma.TransactionClient,
  projectId: string,
  check: ProofCheck,
  runningRequestId?: string,
) {
  if (check.provider !== "serpapi") return false;
  const context = readSnapshotContinuation(check.raw);
  const state = context && readSnapshotExtension(check.raw, context);
  if (!context?.connectionId || !state?.requestId) return false;
  if (
    !["failed", "retryable"].includes(state.state) &&
    !(state.state === "running" && state.requestId === runningRequestId)
  )
    return false;
  const rows = await tx.$queryRaw<ProofRow[]>`
    SELECT b.binding,
      (SELECT COUNT(*) FROM measurement_snapshot_request_attempts a WHERE a."requestId"=b.id) AS prepared,
      (SELECT COUNT(*) FROM measurement_snapshot_dispatch_proofs d WHERE d."requestId"=b.id) AS dispatched,
      (SELECT COUNT(*) FROM metering_paid_attempt_context p JOIN measurement_snapshot_request_attempts a ON a."operationId"=p.operation_id WHERE a."requestId"=b.id) AS intents
    FROM measurement_snapshot_request_bindings b
    WHERE b.id=${state.requestId} AND b."projectId"=${projectId} AND b."keywordId"=${check.keywordId}
      AND b."rankCheckId"=${check.id} AND b."connectionId"=${context.connectionId}`;
  if (rows.length !== 1) return false;
  const row = rows[0];
  if (row.prepared !== 0n || row.dispatched !== 0n || row.intents !== 0n) return false;
  const binding = row.binding as Record<string, unknown> | null;
  if (
    !binding ||
    binding.id !== state.requestId ||
    binding.projectId !== projectId ||
    binding.keywordId !== check.keywordId ||
    binding.rankCheckId !== check.id ||
    binding.connectionId !== context.connectionId ||
    binding.nextStart !== state.nextStart ||
    binding.requestDepth !== 10 ||
    binding.leaseUntil !== state.leaseUntil ||
    !sameDefinitionBytes(binding.context, context)
  )
    return false;
  const connection = await tx.providerConnection.findFirst({
    where: {
      id: context.connectionId,
      projectId,
      provider: "serpapi",
      kind: "serp",
      credentialSource: binding.credentialSource === "hosted" ? "hosted" : "own",
      status: "connected",
      enabled: true,
    },
    select: { id: true },
  });
  // prepare writes evidence, this binding's attempt, and paid intent in one transaction.
  return connection !== null;
}
