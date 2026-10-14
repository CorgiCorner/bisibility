import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import { z } from "zod";
import { preparedRankRecoveryContext } from "./recovery-context";

const money = z.string().regex(/^\d+(\.\d+)?$/);
export const runRecoveryCoverageSchema = z
  .object({
    version: z.literal(1),
    maxAttempts: z.literal(1),
    projectRevision: z.iso.datetime(),
    connectionId: z.string(),
    provider: z.string(),
    fundingSource: z.enum(["own", "hosted"]),
    credentialVersion: z.string().nullable(),
    items: z
      .array(
        z.object({
          keywordId: z.string(),
          hash: z.string(),
          depth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
          costCents: money,
        }),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export type RunRecoveryCoverage = z.infer<typeof runRecoveryCoverageSchema>;
export async function captureRunRecoveryCoverage(
  tx: Prisma.TransactionClient,
  projectId: string,
  targets: readonly { keywordId: string; depth: 10 | 20 | 50 | 100; cost: number | null }[],
  connectionId: string,
  selectionSpec: Prisma.JsonValue,
) {
  if (
    !targets.length ||
    targets.length > 1000 ||
    targets.some(
      (target) => target.cost === null || !Number.isFinite(target.cost) || target.cost < 0,
    )
  )
    return null;
  const [project, connection, keywords] = await Promise.all([
    tx.project.findUniqueOrThrow({ where: { id: projectId } }),
    tx.providerConnection.findUnique({ where: { id: connectionId } }),
    tx.keyword.findMany({
      where: { projectId, id: { in: targets.map((target) => target.keywordId) } },
      include: { locationRef: true },
    }),
  ]);
  if (
    !connection ||
    connection.projectId !== projectId ||
    !project.updatedAt ||
    keywords.length !== targets.length
  )
    return null;
  if (connection.credentialSource === "own" && !connection.credentialsEncrypted) return null;
  const prices = z
    .object({ rankReservationPrices: z.record(z.string(), money) })
    .safeParse(selectionSpec);
  if (
    connection.credentialSource === "hosted" &&
    (!prices.success ||
      targets.some((target) => prices.data.rankReservationPrices[target.keywordId] === undefined))
  )
    return null;
  const items = targets.map((target) => {
    const keyword = keywords.find((row) => row.id === target.keywordId);
    if (!keyword) throw new Error("Original recovery selection changed");
    return {
      keywordId: keyword.id,
      hash: preparedRankRecoveryContext(keyword, project.domain, target.depth) ?? "",
      depth: target.depth,
      costCents: new Prisma.Decimal(
        connection.credentialSource === "hosted" && prices.success
          ? prices.data.rankReservationPrices[target.keywordId]
          : (target.cost as number),
      ).toFixed(),
    };
  });
  return runRecoveryCoverageSchema.parse({
    version: 1,
    maxAttempts: 1,
    projectRevision: project.updatedAt.toISOString(),
    connectionId,
    provider: connection.provider,
    fundingSource: connection.credentialSource,
    credentialVersion:
      connection.credentialSource === "own"
        ? ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted)
        : null,
    items,
  });
}
export async function validateRunRecoveryCoverage(
  tx: Prisma.TransactionClient,
  runId: string,
  coverage: RunRecoveryCoverage,
) {
  const run = await tx.rankCheckRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      project: { include: { defaults: true } },
      items: {
        include: {
          keyword: { include: { locationRef: true, schedule: true, checkSchedule: true } },
        },
      },
    },
  });
  const connection = await tx.providerConnection.findUnique({
    where: { id: coverage.connectionId },
  });
  if (
    run.project.updatedAt.toISOString() !== coverage.projectRevision ||
    !connection ||
    connection.projectId !== run.projectId ||
    connection.provider !== coverage.provider ||
    connection.credentialSource !== coverage.fundingSource ||
    !connection.enabled ||
    connection.status !== "connected" ||
    run.items.length !== coverage.items.length
  )
    return false;
  if (
    coverage.credentialVersion &&
    ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted) !==
      coverage.credentialVersion
  )
    return false;
  const spec = run.selectionSpec as { depth?: 10 | 20 | 50 | 100 | null };
  return run.items.every((item) => {
    const approved = coverage.items.find((row) => row.keywordId === item.keywordId),
      keyword = item.keyword;
    if (!approved || keyword.archivedAt) return false;
    const depth = resolveEffectiveSerpDepth({
      projectDepth: run.project.defaults?.serpDepth,
      requestedDepth: spec.depth ?? undefined,
      checkScheduleDepth: keyword.checkSchedule?.serpDepth,
      scheduleDepth: keyword.schedule?.serpDepth,
    });
    return (
      depth === approved.depth &&
      preparedRankRecoveryContext(keyword, run.project.domain, depth) === approved.hash
    );
  });
}
export function originalRunExposure(coverage: RunRecoveryCoverage) {
  return coverage.items
    .reduce((sum, item) => sum.add(item.costCents), new Prisma.Decimal(0))
    .toFixed();
}
export async function readRunRecoveryCoverage(tx: Prisma.TransactionClient, runId: string) {
  const grant = await tx.rankCheckRunRecoveryGrant.findUnique({ where: { runId } });
  if (
    !grant ||
    grant.namespace !== meteringNamespace() ||
    grant.instanceId !== recoveryInstance() ||
    grant.validUntil <= new Date()
  )
    return null;
  const parsed = runRecoveryCoverageSchema.safeParse(grant.coverage);
  if (!parsed.success || !(await validateRunRecoveryCoverage(tx, runId, parsed.data))) return null;
  return {
    maxCostCents: originalRunExposure(parsed.data),
    targets: parsed.data.items.length,
    maxAttempts: parsed.data.maxAttempts,
  };
}
