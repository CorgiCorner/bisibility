"use server";

import { updateCompetitorDetailsSchema } from "@/lib/actions/competitor-set-input";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateCompetitorViews,
} from "./_shared";

const select = { aliases: true, domain: true, id: true, publicId: true, source: true } as const;

function auditValue(row: { aliases: string[]; domain: string; publicId: string; source: string }) {
  return { aliases: row.aliases, domain: row.domain, id: row.publicId, source: row.source };
}

export async function updateCompetitorDetails(input: unknown) {
  const data = parseActionInput(updateCompetitorDetailsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "competitor",
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.competitor.findFirst({
        select,
        where: { projectId: project.id, publicId: data.competitorId },
      });
      if (!before) throw new Error("Competitor not found.");
      const after = await tx.competitor.update({
        data: {
          aliases: data.aliases,
          domain: data.domain,
          ...(before.domain !== data.domain
            ? { evidence: Prisma.DbNull, source: "manual" as const }
            : {}),
        },
        select,
        where: { id: before.id },
      });
      await writeAudit(
        {
          action: "competitor.details.update",
          actorId: actor.id,
          after: auditValue(after),
          before: auditValue(before),
          projectId: project.id,
          targetId: before.publicId,
          targetType: "competitor",
        },
        tx,
      );
      return auditValue(after);
    });
    revalidateCompetitorViews();
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("This domain is already in your competitors.");
    }
    throw error;
  }
}
