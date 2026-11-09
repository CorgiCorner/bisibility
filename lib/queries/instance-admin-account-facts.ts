import "server-only";
import { requiredPublicAuditId } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";

export async function loadInstanceAccountFacts(identifier: string) {
  const byEmail = identifier.includes("@");
  const user = await prisma.user.findFirst({
    select: {
      createdAt: true,
      deactivatedAt: true,
      email: true,
      id: true,
      memberships: { select: { projectId: true } },
      projects: { select: { id: true } },
      publicId: true,
      sessions: { orderBy: { updatedAt: "desc" }, select: { updatedAt: true }, take: 1 },
    },
    where: byEmail
      ? { email: { equals: identifier, mode: "insensitive" } }
      : { publicId: identifier },
  });
  if (!user) return null;

  const projectIds = [
    ...new Set([
      ...user.projects.map((project) => project.id),
      ...user.memberships.map((membership) => membership.projectId),
    ]),
  ];
  const projectWhere = { projectId: { in: projectIds } };
  const [keywordCount, connectionGroups] = await Promise.all([
    prisma.keyword.count({ where: projectWhere }),
    prisma.providerConnection.groupBy({
      _count: { _all: true },
      by: ["kind"],
      where: projectWhere,
    }),
  ]);

  return {
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    id: requiredPublicAuditId(user.publicId, "usr", "User"),
    keywordCount,
    lastActiveAt: user.sessions[0]?.updatedAt.toISOString() ?? null,
    projectIds,
    projectCount: projectIds.length,
    providerConnectionsByKind: connectionGroups.map((group) => ({
      count: group._count._all,
      kind: group.kind,
    })),
    status: user.deactivatedAt ? ("deactivated" as const) : ("active" as const),
  };
}
