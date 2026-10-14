import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import {
  captureRunRecoveryCoverage,
  runRecoveryCoverageSchema,
  validateRunRecoveryCoverage,
} from "./recovery-run-coverage";

/** Original interactive owner consent, bounded to one already-created run. */
export async function retainRunRecoveryGrant(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    projectId: string;
    actorId: string | null;
    source: string;
    trigger: string;
    credentialId?: string;
    now: Date;
    targets?: readonly { keywordId: string; depth: 10 | 20 | 50 | 100; cost: number | null }[];
    connectionId?: string;
  },
) {
  if (input.source !== "app" || input.trigger !== "manual" || !input.actorId || input.credentialId)
    return;
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { ownerId: true },
  });
  if (project?.ownerId !== input.actorId) return;
  if (!input.targets || !input.connectionId) return;
  const run = await tx.rankCheckRun.findUnique({
    where: { id: input.runId },
    select: { projectId: true, requestedById: true, selectionSpec: true },
  });
  if (!run || run.projectId !== input.projectId || run.requestedById !== input.actorId) return;
  const coverage = await captureRunRecoveryCoverage(
    tx,
    input.projectId,
    input.targets,
    input.connectionId,
    run.selectionSpec,
  );
  if (!coverage) return;
  await tx.rankCheckRunRecoveryGrant.create({
    data: {
      runId: input.runId,
      namespace: meteringNamespace(),
      instanceId: recoveryInstance(),
      ownerId: project.ownerId,
      actorId: input.actorId,
      coverage,
      validUntil: new Date(input.now.getTime() + 86400000),
    },
  });
}
export async function requestOriginalRunResume(
  tx: Prisma.TransactionClient,
  runId: string,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM rank_check_runs WHERE id=${runId} FOR UPDATE`;
  const run = await tx.rankCheckRun.findUnique({
    where: { id: runId },
    include: {
      recoveryGrant: true,
      project: { include: { owner: true } },
      _count: { select: { rankChecks: true } },
      items: { select: { rankCheckId: true, status: true } },
    },
  });
  if (!run?.recoveryGrant) return false;
  const grant = run.recoveryGrant;
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${run.projectId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id=${grant.actorId} FOR SHARE`;
  const project = await tx.project.findUniqueOrThrow({
    where: { id: run.projectId },
    include: { owner: true },
  });
  if (
    grant.namespace !== meteringNamespace() ||
    grant.instanceId !== recoveryInstance() ||
    grant.validUntil <= now ||
    grant.ownerId !== project.ownerId ||
    grant.actorId !== run.requestedById ||
    project.owner.deactivatedAt ||
    project.writeMode !== "active" ||
    run.deletedAt ||
    run.status !== "queued" ||
    run.claimedAt ||
    !run.orchestrationWorkflowId ||
    run._count.rankChecks ||
    !run.items.length ||
    run.items.some((item) => item.rankCheckId || item.status !== "queued")
  )
    return false;
  const coverage = runRecoveryCoverageSchema.safeParse(grant.coverage);
  if (!coverage.success || !(await validateRunRecoveryCoverage(tx, runId, coverage.data)))
    return false;
  // The existing intent consumer and stable workflow id own execution and fresh normal admission.
  await tx.rankCheckRun.update({ where: { id: runId }, data: { updatedAt: now } });
  await tx.rankCheckRunRecoveryGrant.update({ where: { runId }, data: { requestedAt: now } });
  return true;
}

/** Recheck preserved consent at normal provider admission, including ownership transfers. */
export async function assertRunRecoveryAdmission(
  tx: Prisma.TransactionClient,
  runId: string,
  checkId?: string,
  operationId?: string,
  operationNamespace?: string,
) {
  const grant = await tx.rankCheckRunRecoveryGrant.findUnique({ where: { runId } });
  if (!grant?.requestedAt) return {};
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recovery-admission:${runId}`}))`;
  await tx.$queryRaw`SELECT id FROM rank_check_runs WHERE id=${runId} FOR SHARE`;
  const run = await tx.rankCheckRun.findUniqueOrThrow({
    where: { id: runId },
    select: { projectId: true, deletedAt: true, requestedById: true },
  });
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${run.projectId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id=${grant.actorId} FOR SHARE`;
  const project = await tx.project.findUniqueOrThrow({
    where: { id: run.projectId },
    include: { owner: true },
  });
  if (
    grant.validUntil <= new Date() ||
    grant.namespace !== meteringNamespace() ||
    grant.instanceId !== recoveryInstance() ||
    grant.ownerId !== project.ownerId ||
    run.requestedById !== grant.actorId ||
    project.owner.deactivatedAt ||
    project.writeMode !== "active" ||
    run.deletedAt
  )
    throw new Error("Original run recovery authorization changed");
  const coverage = runRecoveryCoverageSchema.parse(grant.coverage);
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${coverage.connectionId} FOR SHARE`;
  await tx.$queryRaw`SELECT k.id FROM keywords k JOIN rank_check_run_items item ON item."keywordId"=k.id
    WHERE item."runId"=${runId} ORDER BY k.id FOR SHARE OF k`;
  if (!(await validateRunRecoveryCoverage(tx, runId, coverage)))
    throw new Error("Original run recovery inputs changed");
  if (!checkId) return { recoveryGrantExpiresAt: grant.validUntil.toISOString() };
  await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${checkId} FOR UPDATE`;
  const check = await tx.rankCheck.findUniqueOrThrow({ where: { id: checkId } });
  const approved = coverage.items.find((item) => item.keywordId === check.keywordId);
  if (check.runId !== runId || !approved || check.requestedDepth !== approved.depth)
    throw new Error("Original run recovery inputs changed");
  const [attempts] = await tx.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) AS count FROM metering_paid_attempt_context
    WHERE ((context->>'rankCheckRunId'=${runId} AND context->>'keywordId'=${check.keywordId})
      OR context->>'rankCheckId' IN (SELECT id FROM rank_checks WHERE "runId"=${runId} AND "keywordId"=${check.keywordId}))
      AND (namespace,operation_id) IS DISTINCT FROM (${operationNamespace ?? meteringNamespace()},${operationId ?? null})
      AND fenced_at IS NOT NULL`;
  if (Number(attempts?.count ?? 0n) >= coverage.maxAttempts)
    throw new Error("Original run recovery attempt limit reached");
  return {
    recoveryGrantExpiresAt: grant.validUntil.toISOString(),
    recoveryMaxCostCents: approved.costCents,
    recoveryConnectionId: coverage.connectionId,
    recoveryProvider: coverage.provider,
    recoveryFunding: coverage.fundingSource,
    recoveryKeywordId: check.keywordId,
  };
}
