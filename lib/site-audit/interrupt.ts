import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { settleSiteAuditCrawl } from "./budget-extension";
import { saveSiteAuditSummary } from "./report-store";

export type SiteAuditControlActor = {
  actorId: string | null;
  credentialId?: string;
  credentialKind?: string;
};

export async function interruptSiteAuditRun(
  db: PrismaClient,
  id: string,
  state: "cancelled" | "failed" | "paused",
  generation?: number,
  actor?: SiteAuditControlActor,
) {
  return db.$transaction(async (tx) => {
    const before = await tx.siteAuditRun.findUniqueOrThrow({ where: { id } });
    const allowed =
      state === "cancelled" ? ["queued", "running", "paused", "stopped"] : ["queued", "running"];
    if (
      !allowed.includes(before.state) ||
      (generation !== undefined && generation !== before.generation)
    )
      return before;
    const updated = await tx.siteAuditRun.updateMany({
      where: {
        id,
        generation: before.generation,
        state: before.state,
      },
      data: {
        state,
        stopReason: state === "cancelled" ? "cancelled" : state === "failed" ? "error" : null,
        completedAt: state === "paused" ? null : new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    const run = await tx.siteAuditRun.findUniqueOrThrow({ where: { id } });
    if (updated.count) {
      await saveSiteAuditSummary(tx, run);
      await settleSiteAuditCrawl(tx, id);
      if (actor && state === "cancelled") {
        const { actorId, ...credential } = actor;
        await writeAudit(
          {
            action: "site_audit.cancel",
            actorId,
            projectId: run.projectId,
            targetType: "site_audit_run",
            targetId: run.publicId,
            before: { state: before.state, generation: before.generation },
            after: { state: run.state, generation: run.generation, ...credential },
          },
          tx,
        );
      }
    }
    return run;
  });
}
