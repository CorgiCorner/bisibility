import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
export type RankResultEvidence = { projection: EvidenceProjection; position: number | null };
export async function readRankResultEvidence(
  tx: Prisma.TransactionClient,
  projectId: string,
  checkIds: readonly string[],
) {
  const values = await readCheckEvidence(projectId, { checkIds }, tx);
  const selected = [...values].flatMap(([id, value]) =>
    value?.result === "partial" || value?.result === "recovered" ? [id] : [],
  );
  if (!selected.length) return new Map<string, RankResultEvidence>();
  const checks = await tx.rankCheck.findMany({
    where: { publicId: { in: selected }, keyword: { projectId } },
    select: { publicId: true, position: true },
  });
  return new Map<string, RankResultEvidence>(
    checks.flatMap((check) => {
      const projection = values.get(check.publicId);
      return projection ? [[check.publicId, { projection, position: check.position }]] : [];
    }),
  );
}
