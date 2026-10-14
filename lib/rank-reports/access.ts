import "server-only";

import { type Actor, AuthorizationError, authorize } from "@/lib/auth/authorize";
import type { Prisma, PrismaClient, Role } from "@/lib/generated/prisma/client";
import { RankReportSelectionError, RankReportSnapshotConflictError } from "./errors";
import type { RankReportRequest } from "./model";

export type RankReportContext = {
  actor: Actor;
  credentialId?: string;
  transport: "session" | "personal_token" | "project_key";
};
export type RankReportDatabase = Pick<PrismaClient, "$transaction">;

export function snapshotRankReportContext(context: RankReportContext): RankReportContext {
  return {
    actor: {
      id: context.actor.id,
      ...(context.actor.memberships
        ? {
            memberships: context.actor.memberships.map(({ projectId, role }) => ({
              projectId,
              role,
            })),
          }
        : {}),
      ...(context.actor.role !== undefined ? { role: context.actor.role } : {}),
    },
    ...(context.credentialId !== undefined ? { credentialId: context.credentialId } : {}),
    transport: context.transport,
  };
}

/** Context comes only from a verified server session/bearer adapter, never the request body. */
export async function authorizeRankReportScope(
  tx: Prisma.TransactionClient,
  context: RankReportContext,
  request: RankReportRequest,
  asOf: Date,
) {
  const project = await tx.project.findFirst({
    select: { id: true, publicId: true },
    where: { publicId: request.projectId },
  });
  if (!project) throw new RankReportSelectionError();
  let actor = context.actor;
  if (context.transport !== "project_key") {
    const active = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM users WHERE id=${actor.id} AND "deactivatedAt" IS NULL`;
    if (active.length !== 1) throw new AuthorizationError("forbidden");
    const memberships = await tx.$queryRaw<Array<{ role: Role }>>`
      SELECT role::text AS role FROM memberships WHERE "userId"=${actor.id} AND "projectId"=${project.id}`;
    actor = {
      ...actor,
      memberships: memberships.map(({ role }) => ({ projectId: project.id, role })),
    };
  }
  authorize(actor, "read", { projectId: project.id, type: "keyword" });
  const keywords = request.selectedIds.length
    ? await tx.keyword.findMany({
        select: { createdAt: true, id: true, publicId: true },
        where: { projectId: project.id, publicId: { in: request.selectedIds } },
      })
    : [];
  if (keywords.length !== request.selectedIds.length) throw new RankReportSelectionError();
  if (keywords.some((keyword) => keyword.createdAt > asOf))
    throw new RankReportSnapshotConflictError();
  return { actor, keywords, project };
}
