import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "@/lib/rank-check/queued-source-schema";
import { type EvidenceProjection, projectCheckEvidence } from "./model";

/** Constant query count for any page; caller supplies an already authorized project. */
export async function readCheckEvidence(
  projectId: string,
  input: { checkIds?: readonly string[]; where?: Prisma.RankCheckWhereInput },
  db: Pick<
    Prisma.TransactionClient,
    "rankCheck" | "providerDispatchIdentity" | "providerRecoveryCandidate"
  > = prisma,
): Promise<Map<string, EvidenceProjection | null>> {
  if (input.checkIds?.length === 0) return new Map();
  const checks = await db.rankCheck.findMany({
    where: {
      AND: [
        { keyword: { projectId } },
        input.where ?? {},
        ...(input.checkIds
          ? [
              {
                OR: [
                  { id: { in: [...input.checkIds] } },
                  { publicId: { in: [...input.checkIds] } },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      attemptCount: true,
      id: true,
      publicId: true,
      provider: true,
      status: true,
      checkedAt: true,
      recoveryRestoredAt: true,
      recoveryProvenance: true,
      partialEvidence: {
        where: { schemaVersion: { not: QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } },
        select: { kind: true, returnedDepth: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  const ids = checks.map((check) => check.id);
  if (!ids.length) return new Map();
  const [identities, candidates] = await Promise.all([
    db.providerDispatchIdentity.findMany({
      where: { projectId, rankCheckId: { in: ids } },
      select: {
        rankCheckId: true,
        operationPk: true,
        provider: true,
        operation: { select: { providerOperationEvidence: true } },
      },
    }),
    db.providerRecoveryCandidate.findMany({
      where: { rankCheckId: { in: ids } },
      select: { operationPk: true, accountingOnly: true },
    }),
  ]);
  const accountingOnly = new Set(
    candidates
      .filter((candidate) => candidate.accountingOnly)
      .map((candidate) => candidate.operationPk),
  );
  const byCheck = new Map<string, typeof identities>();
  for (const identity of identities) {
    const group = byCheck.get(identity.rankCheckId) ?? [];
    group.push(identity);
    byCheck.set(identity.rankCheckId, group);
  }
  return new Map(
    checks.map((check) => [
      check.publicId ?? check.id,
      projectCheckEvidence(
        check,
        (byCheck.get(check.id) ?? []).map((identity) => ({
          operationPk: identity.operationPk,
          provider: identity.provider,
          accountingOnly: accountingOnly.has(identity.operationPk),
          evidence: identity.operation.providerOperationEvidence,
        })),
      ),
    ]),
  );
}
