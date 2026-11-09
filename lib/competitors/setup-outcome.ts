import "server-only";
import { type AuditClient, writeAudit } from "@/lib/auth/audit";
import type { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
export async function recordSetupOutcome(
  client: Pick<typeof prisma, "project"> & AuditClient,
  project: { id: string; publicId: string },
  actorId: string,
  outcome: "confirmed" | "skipped",
) {
  const changed = await client.project.updateMany({
    data: { competitorSetupDecidedAt: new Date(), competitorSetupOutcome: outcome },
    where: {
      id: project.id,
      OR: [{ competitorSetupOutcome: null }, { NOT: { competitorSetupOutcome: outcome } }],
    },
  });
  await writeAudit(
    {
      action: outcome === "confirmed" ? "competitor.setup.confirm" : "competitor.setup.skip",
      actorId,
      after: { outcome },
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    },
    client,
  );
  return changed.count;
}

export async function lockProjectForSetup(
  client: Pick<typeof prisma, "$queryRaw">,
  projectId: string,
) {
  await client.$queryRaw(
    Prisma.sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`,
  );
}
