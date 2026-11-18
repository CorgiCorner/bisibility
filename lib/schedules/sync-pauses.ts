import "server-only";

import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import type { DataSyncKind } from "./types";

export const syncPauseKinds = {
  domain_rating: "domain_rating",
  sitemap: "sitemap_fetch",
  search_console: "search_console_import",
  page_indexing: "page_indexing",
} as const satisfies Record<DataSyncKind, string>;

type PauseKind = (typeof syncPauseKinds)[DataSyncKind];

export function syncPauseSelection(kind: PauseKind) {
  return { where: { kind }, select: { kind: true } } as const;
}

export async function isProjectSyncPaused(
  projectId: string,
  kind: PauseKind,
  db: Pick<Prisma.TransactionClient, "projectSyncPause"> = prisma,
) {
  return Boolean(
    await db.projectSyncPause.findUnique({
      where: { projectId_kind: { projectId, kind } },
      select: { id: true },
    }),
  );
}

export async function writeProjectSyncPause(
  tx: Prisma.TransactionClient,
  input: { actorId: string | null; enabled: boolean; kind: PauseKind; projectId: string },
) {
  const { actorId, enabled, kind, projectId } = input;
  // Serialize state, legacy mirrors and audit with other project writes.
  await lockProjectForProviderMutation(tx, projectId);
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, syncPauses: syncPauseSelection(kind), writeMode: true },
  });
  assertProjectWritable(project);
  const wasEnabled = project.syncPauses.length === 0;
  if (enabled && !wasEnabled) {
    await tx.projectSyncPause.deleteMany({ where: { projectId, kind } });
  }
  if (!enabled && wasEnabled) {
    await tx.projectSyncPause.create({ data: { actorId, kind, projectId } });
  }

  // Older workers still read these mirrors during the rolling deployment.
  const legacy =
    kind === "domain_rating"
      ? { domainRatingEnabled: enabled }
      : kind === "sitemap_fetch"
        ? { sitemapMonitoringEnabled: enabled }
        : null;
  if (legacy) await tx.project.update({ where: { id: projectId }, data: legacy });
  return wasEnabled;
}
