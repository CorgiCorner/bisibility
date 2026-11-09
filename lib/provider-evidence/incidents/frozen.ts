import type { Prisma } from "@/lib/generated/prisma/client";

function inputProvider(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return "provider" in input ? input.provider : null;
}

/** A persisted fallback winner takes effect before the later enqueue/promotion hook. */
export async function frozenIncidentOperations(
  tx: Prisma.TransactionClient,
  links: Array<{ operationPk: string; operation: { input: unknown } }>,
): Promise<Set<string>> {
  const intents = await tx.providerRecoveryIntent.findMany({
    where: { operationPk: { in: links.map((row) => row.operationPk) } },
    include: { candidate: { select: { rankCheckId: true } } },
  });
  const checks = await tx.rankCheck.findMany({
    where: { id: { in: intents.map((row) => row.candidate.rankCheckId) } },
    select: { id: true, status: true, provider: true },
  });
  return new Set(
    intents
      .filter((intent) => {
        if (intent.accountingOnly) return true;
        const check = checks.find((row) => row.id === intent.candidate.rankCheckId);
        if (check?.status !== "completed") return false;
        const input = links.find((row) => row.operationPk === intent.operationPk)?.operation.input;
        const provider = inputProvider(input);
        return provider !== check.provider;
      })
      .map((intent) => intent.operationPk),
  );
}
