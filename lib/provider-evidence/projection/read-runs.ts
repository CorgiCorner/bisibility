import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readCheckEvidence } from "./read";
import { evidenceProjectionResource } from "./wire";

export async function readRunEvidence(projectId: string, runIds: readonly string[]) {
  if (!runIds.length) return new Map();
  const checks = await prisma.rankCheck.findMany({
    where: { keyword: { projectId }, run: { projectId, publicId: { in: [...runIds] } } },
    select: { publicId: true, run: { select: { publicId: true } } },
  });
  const evidence = await readCheckEvidence(projectId, {
    checkIds: checks.flatMap((check) => (check.publicId ? [check.publicId] : [])),
  });
  return new Map(
    runIds.map((runId) => {
      const values = checks.flatMap((check) => {
        const projection = check.publicId
          ? evidenceProjectionResource(evidence.get(check.publicId))
          : null;
        return check.run?.publicId === runId && projection
          ? [{ check_id: check.publicId!, ...projection }]
          : [];
      });
      return [runId, values.length ? values : null];
    }),
  );
}
