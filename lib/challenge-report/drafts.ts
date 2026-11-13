import "server-only";

import { prisma } from "@/lib/db/prisma";
import { challengeReportIsDraft } from "./period";
import { challengeReportBodySchema } from "./schema";

export async function challengeReportDraftIds(
  projectId: string,
  publicIds: readonly string[],
  today: string,
) {
  const drafts = new Set<string>();
  if (publicIds.length === 0) return drafts;
  const rows = await prisma.agentReport.findMany({
    select: { body: true, publicId: true },
    where: { kind: "challenge_report", projectId, publicId: { in: [...publicIds] } },
  });
  for (const row of rows) {
    const parsed = challengeReportBodySchema.safeParse(row.body);
    if (
      parsed.success &&
      !parsed.data.journey &&
      challengeReportIsDraft(parsed.data.period.to, today)
    ) {
      drafts.add(row.publicId);
    }
  }
  return drafts;
}
