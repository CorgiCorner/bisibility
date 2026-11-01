import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveDomainRatingCredentials } from "@/lib/domain-rating/credentials";
import type { DomainRatingView } from "@/lib/domain-rating/history";
import { normalizeDomain } from "@/lib/domains/normalize";
import { requireReadableProject } from "./_auth";

export async function getDomainRating(
  projectRef: string,
  now = new Date(),
): Promise<DomainRatingView> {
  const { project } = await requireReadableProject(projectRef);
  const settings = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { domain: true, domainRatingEnabled: true },
  });
  const domain = settings.domain ? normalizeDomain(settings.domain) : null;
  const [rows, credentials, ownConnections] = await Promise.all([
    domain
      ? prisma.domainRatingCheck.findMany({
          where: { projectId: project.id, domain },
          orderBy: { day: "desc" },
          take: 365,
        })
      : [],
    project.isSample ? null : resolveDomainRatingCredentials(project.id, now),
    prisma.providerConnection.count({
      where: { projectId: project.id, provider: "ahrefs", credentialsEncrypted: { not: null } },
    }),
  ]);
  return {
    projectId: project.publicId,
    domain,
    enabled: settings.domainRatingEnabled,
    source: credentials?.source ?? null,
    hasOwnConnection: ownConnections > 0,
    points: [...rows]
      .reverse()
      .map((row) => ({ day: row.day.toISOString().slice(0, 10), rating: row.rating })),
    lastAttemptAt: rows[0]?.createdAt.toISOString() ?? null,
    lastSuccessAt: rows.find((row) => row.rating !== null)?.completedAt?.toISOString() ?? null,
    lastError: rows[0]?.error ?? null,
  };
}
