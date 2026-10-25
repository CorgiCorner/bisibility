import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";

export const digestSentAction = "report.weekly_digest_sent";

export async function finalizeDigest(
  project: { id: string; publicId: string },
  periodEnd: Date,
  metrics: { failedChecksCount: number; topMovers: number },
  incidentDigest: boolean,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize finalization only, never hold a transaction open during email transport.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`weekly-digest:${project.id}:${periodEnd.toISOString()}`}, 0))`;
    const records = await tx.weeklyDigestSend.findMany({
      where: { projectId: project.id, periodEnd },
      select: { status: true },
    });
    const failed = records.filter(
      (row) => row.status === "failed" || row.status === "claimed",
    ).length;
    const sent = records.filter((row) => row.status === "sent").length;
    const ambiguous = records.filter((row) => row.status === "ambiguous").length;
    const skipped = records.filter((row) => row.status === "skipped").length;
    if (failed) return { failed, sent, ambiguous, skipped };
    const existing = await tx.auditLog.findFirst({
      where: {
        action: digestSentAction,
        projectId: project.id,
        after: { path: ["periodEnd"], equals: periodEnd.toISOString() },
      },
      select: { id: true },
    });
    if (!existing)
      await writeAudit(
        {
          action: digestSentAction,
          actorId: null,
          projectId: project.id,
          targetId: project.publicId,
          targetType: "project",
          after: {
            ...metrics,
            recipients: records.length,
            sent,
            ambiguous,
            skipped,
            periodEnd: periodEnd.toISOString(),
          },
        },
        tx,
      );
    if (incidentDigest)
      await tx.$executeRaw`
      INSERT INTO provider_incident_delivery_watermarks ("projectId", "deliveredThrough", "updatedAt")
      VALUES (${project.id}, ${periodEnd}, now())
      ON CONFLICT ("projectId") DO UPDATE SET "deliveredThrough" = GREATEST(provider_incident_delivery_watermarks."deliveredThrough", EXCLUDED."deliveredThrough"), "updatedAt"=now()`;
    return { failed, sent, ambiguous, skipped };
  });
}
