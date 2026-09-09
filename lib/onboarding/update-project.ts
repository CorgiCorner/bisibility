import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import type { UpdateOnboardingProjectResult } from "./project-update-result";
import { retargetWebsiteUrl } from "./retarget-website";
import type { WebsiteProjectIdentity } from "./website";

const projectSelect = {
  domain: true,
  id: true,
  isSample: true,
  name: true,
  publicId: true,
} as const;

/** Caller must authorize project update before entering this transaction. */
export async function updateUnmeasuredProject(
  input: { actorId: string; projectId: string; identity: WebsiteProjectIdentity },
  database: Pick<typeof prisma, "$transaction"> = prisma,
): Promise<UpdateOnboardingProjectResult> {
  return database.$transaction(
    async (tx: Prisma.TransactionClient): Promise<UpdateOnboardingProjectResult> => {
      await lockProjectForProviderMutation(tx, input.projectId);
      const before = await tx.project.findUniqueOrThrow({
        select: projectSelect,
        where: { id: input.projectId },
      });
      if (before.domain === input.identity.domain)
        return { ok: true, changed: false, project: before };
      // Serialize against keyword edits and RankCheck FK inserts while checking the gate.
      await tx.$queryRaw`SELECT "id" FROM "keywords" WHERE "projectId" = ${input.projectId} ORDER BY "id" FOR UPDATE`;
      const firstCheck = await tx.rankCheck.findFirst({
        where: { keyword: { projectId: input.projectId } },
        orderBy: { checkedAt: "asc" },
        select: { checkedAt: true },
      });
      if (firstCheck)
        return {
          ok: false,
          error: { code: "PROJECT_HAS_RANK_CHECKS" },
          project: { ...before, trackingStartedAt: firstCheck.checkedAt.toISOString() },
        };
      const keywords = await tx.keyword.findMany({
        where: { projectId: input.projectId, targetUrl: { not: null } },
        select: { id: true, publicId: true, targetUrl: true },
      });
      let rewrittenKeywords = 0;
      for (const keyword of keywords) {
        const targetUrl = retargetWebsiteUrl(
          keyword.targetUrl,
          before.domain,
          input.identity.domain,
        );
        if (targetUrl === keyword.targetUrl) continue;
        await tx.keyword.update({ where: { id: keyword.id }, data: { targetUrl } });
        await writeAudit(
          {
            action: "keyword.update",
            actorId: input.actorId,
            projectId: input.projectId,
            targetId: keyword.publicId,
            targetType: "keyword",
            before: { targetUrl: keyword.targetUrl },
            after: { targetUrl },
          },
          tx,
        );
        rewrittenKeywords += 1;
      }
      const gsc = await tx.providerConnection.findUnique({
        where: { projectId_provider: { projectId: input.projectId, provider: "gsc" } },
        select: { id: true, publicId: true, status: true },
      });
      if (gsc) {
        await tx.providerConnection.delete({ where: { id: gsc.id } });
        await writeAudit(
          {
            action: "provider.disconnect",
            actorId: input.actorId,
            projectId: input.projectId,
            targetId: gsc.publicId,
            targetType: "provider_connection",
            before: { provider: "gsc", status: gsc.status },
            after: { provider: "gsc", status: "removed" },
          },
          tx,
        );
      }
      const project = await tx.project.update({
        where: { id: input.projectId },
        data: input.identity,
        select: projectSelect,
      });
      await writeAudit(
        {
          action: "onboarding.project_website.update",
          actorId: input.actorId,
          projectId: input.projectId,
          targetId: project.publicId,
          targetType: "project",
          before: { domain: before.domain, name: before.name, gscConnected: Boolean(gsc) },
          after: {
            domain: project.domain,
            name: project.name,
            gscConnected: false,
            rewrittenKeywords,
          },
        },
        tx,
      );
      return { ok: true, changed: true, project };
    },
  );
}
