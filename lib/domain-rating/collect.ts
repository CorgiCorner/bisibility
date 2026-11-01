import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeDomain } from "@/lib/domains/normalize";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { resolveDomainRatingCredentials } from "./credentials";
import { DOMAIN_RATING_VERSION, DomainRatingError, fetchDomainRating } from "./provider";

export function collectDomainRating(projectId: string, now = new Date()) {
  return collect(projectId, now, false);
}

export function collectInitialDomainRating(projectId: string, now = new Date()) {
  return collect(projectId, now, true);
}

async function collect(projectId: string, now: Date, initial: boolean) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      domain: true,
      isSample: true,
      writeMode: true,
      domainRatingEnabled: true,
      owner: { select: { deactivatedAt: true } },
    },
  });
  const domain = project?.domain ? normalizeDomain(project.domain) : null;
  if (
    !project ||
    !domain ||
    project.isSample ||
    project.owner?.deactivatedAt ||
    project.writeMode !== "active" ||
    (!initial && !project.domainRatingEnabled)
  )
    return "disabled";
  if (
    initial &&
    (await prisma.domainRatingCheck.findFirst({
      where: { projectId, domain },
      select: { id: true },
    }))
  )
    return "already_checked";
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const where = { projectId_domain_day: { projectId, domain, day } };
  if (await prisma.domainRatingCheck.findUnique({ where })) return "already_checked";
  const credentials = await resolveDomainRatingCredentials(projectId, now);
  if (!credentials) return "unavailable";
  // Unique daily claims survive worker restarts; an ambiguous request is never replayed.
  const claimed = await prisma.domainRatingCheck.createMany({
    data: [{ projectId, domain, day, version: DOMAIN_RATING_VERSION, source: credentials.source }],
    skipDuplicates: true,
  });
  if (!claimed.count) return "already_checked";
  // Recheck intent after claiming, so a queued job cannot override a pause or domain change.
  const current = await prisma.project.findUnique({ where: { id: projectId } });
  if (
    !current ||
    (!initial && !current.domainRatingEnabled) ||
    current.isSample ||
    current.writeMode !== "active" ||
    normalizeDomain(current.domain ?? "") !== domain
  ) {
    await prisma.domainRatingCheck.delete({ where });
    return "disabled";
  }
  const active = await resolveDomainRatingCredentials(projectId, new Date());
  if (!active) {
    await prisma.domainRatingCheck.delete({ where });
    return "unavailable";
  }
  const gate = await consumeProviderLimit("ahrefs", { apiKey: active.key }, { projectId });
  if (!gate.success) {
    await prisma.domainRatingCheck.delete({ where });
    return "rate_limited";
  }
  let rating: number;
  try {
    rating = await fetchDomainRating(domain, active.key);
  } catch (error) {
    const code = error instanceof DomainRatingError ? error.code : "unavailable";
    await prisma.domainRatingCheck.update({
      where,
      data: { error: code, source: active.source, completedAt: new Date() },
    });
    return "failed";
  }
  await prisma.domainRatingCheck.update({
    where,
    data: { rating, source: active.source, completedAt: new Date() },
  });
  if (active.connectionId)
    await prisma.providerConnection.updateMany({
      where: { id: active.connectionId },
      data: { lastUsedAt: now },
    });
  return "succeeded";
}
