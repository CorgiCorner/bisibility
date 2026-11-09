import { requiredPublicAuditId } from "@/lib/auth/audit";
import type { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";

export const competitorSelect = {
  aliases: true,
  domain: true,
  evidence: true,
  id: true,
  label: true,
  publicId: true,
  scopePolicy: true,
  source: true,
} as const;

export type CompetitorRecord = {
  aliases: string[];
  domain: string;
  evidence: unknown;
  id: string;
  label: string | null;
  publicId: string | null;
  scopePolicy: "all_markets" | "selected_markets";
  source: "manual" | "suggested";
};

function requiredCompetitorId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "cmp")) {
    throw new Error("Competitor public ID is not available.");
  }
  return value;
}

export function publicCompetitor(competitor: CompetitorRecord) {
  return {
    aliases: competitor.aliases,
    domain: competitor.domain,
    evidence: competitor.evidence,
    id: requiredCompetitorId(competitor.publicId),
    label: competitor.label,
    scopePolicy: competitor.scopePolicy,
    source: competitor.source,
  };
}

export function competitorAuditTarget(competitor: ReturnType<typeof publicCompetitor>) {
  return requiredPublicAuditId(competitor.id, "cmp", "Competitor");
}

export async function findScopedCompetitor(
  client: Pick<typeof prisma, "competitor">,
  projectId: string,
  competitorId: string,
) {
  if (!isPublicIdOfType(competitorId, "cmp")) throw new Error("Competitor not found.");
  const competitor = await client.competitor.findFirst({
    select: competitorSelect,
    where: { projectId, publicId: competitorId },
  });
  if (!competitor) throw new Error("Competitor not found.");
  return competitor as CompetitorRecord;
}
