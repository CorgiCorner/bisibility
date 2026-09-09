import "server-only";

import {
  parseActionInput,
  requireProjectScope,
  revalidateCompetitorViews,
} from "@/lib/actions/_shared";
import { type AuditClient, writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import {
  addManagedCompetitorSchema,
  removeManagedCompetitorSchema,
  renameManagedCompetitorSchema,
} from "@/lib/competitors/types";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";

type CompetitorRecord = {
  domain: string;
  id: string;
  label: string | null;
  publicId: string | null;
};

function safeCompetitor(competitor: CompetitorRecord) {
  return {
    domain: competitor.domain,
    id: requiredPublicId(competitor.publicId),
    label: competitor.label,
  };
}

function requiredPublicId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "cmp")) {
    throw new Error("Competitor public ID is not available.");
  }
  return value;
}

async function competitorProjectScope(
  actor: Actor,
  action: "create" | "delete" | "update",
  projectId: string,
) {
  const project = await requireProjectScope(actor, action, projectId, { type: "competitor" });
  return { actor, project };
}

async function findManagedCompetitor(projectId: string, competitorId: string) {
  if (!isPublicIdOfType(competitorId, "cmp")) {
    throw new Error("Competitor not found.");
  }
  const competitor = await prisma.competitor.findFirst({
    select: { domain: true, id: true, label: true, publicId: true },
    where: { projectId, publicId: competitorId },
  });
  if (!competitor) {
    throw new Error("Competitor not found.");
  }
  return competitor;
}

async function lockProjectForSetup(client: Pick<typeof prisma, "$queryRaw">, projectId: string) {
  await client.$queryRaw(
    Prisma.sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`,
  );
}

async function recordConfirmedSetupOutcome(
  client: Pick<typeof prisma, "project"> & AuditClient,
  project: { id: string; publicId: string },
  actorId: string | null,
) {
  await client.project.updateMany({
    data: { competitorSetupDecidedAt: new Date(), competitorSetupOutcome: "confirmed" },
    where: {
      id: project.id,
      OR: [{ competitorSetupOutcome: null }, { NOT: { competitorSetupOutcome: "confirmed" } }],
    },
  });
  await writeAudit(
    {
      action: "competitor.setup.confirm",
      actorId,
      after: { outcome: "confirmed" },
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    },
    client,
  );
}

export async function addManagedCompetitorFor(
  input: unknown,
  context: { actor: Actor; auditActorId: string | null },
) {
  const data = parseActionInput(addManagedCompetitorSchema, input);
  const { project } = await competitorProjectScope(context.actor, "create", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
    await lockProjectForSetup(tx, project.id);
    const existing = await tx.competitor.findUnique({
      select: { domain: true, id: true, label: true, publicId: true },
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
    });
    if (existing) {
      throw new Error("This competitor is already managed.");
    }

    const competitor = await tx.competitor.create({
      data: {
        domain: data.domain,
        label: data.label ?? null,
        projectId: project.id,
        publicId: makePublicId("cmp"),
      },
      select: { domain: true, id: true, label: true, publicId: true },
    });
    await writeAudit(
      {
        action: "competitor.add",
        actorId: context.auditActorId,
        after: safeCompetitor(competitor),
        projectId: project.id,
        targetId: requiredPublicId(competitor.publicId),
        targetType: "competitor",
      },
      tx,
    );
    await recordConfirmedSetupOutcome(tx, project, context.auditActorId);
    return safeCompetitor(competitor);
  });
  revalidateCompetitorViews();

  return result;
}

export async function renameManagedCompetitorFor(
  input: unknown,
  context: { actor: Actor; auditActorId: string | null },
) {
  const data = parseActionInput(renameManagedCompetitorSchema, input);
  const { project } = await competitorProjectScope(context.actor, "update", data.projectId);
  const before = await findManagedCompetitor(project.id, data.competitorId);
  const competitor = await prisma.competitor.update({
    data: { label: data.label },
    select: { domain: true, id: true, label: true, publicId: true },
    where: { id: before.id },
  });

  await writeAudit({
    action: "competitor.rename",
    actorId: context.auditActorId,
    after: safeCompetitor(competitor),
    before: safeCompetitor(before),
    projectId: project.id,
    targetId: requiredPublicId(competitor.publicId),
    targetType: "competitor",
  });
  revalidateCompetitorViews();

  return safeCompetitor(competitor);
}

export async function removeManagedCompetitorFor(
  input: unknown,
  context: { actor: Actor; auditActorId: string | null },
) {
  const data = parseActionInput(removeManagedCompetitorSchema, input);
  const { project } = await competitorProjectScope(context.actor, "delete", data.projectId);
  const before = await findManagedCompetitor(project.id, data.competitorId);

  await prisma.competitor.delete({ where: { id: before.id } });
  await writeAudit({
    action: "competitor.remove",
    actorId: context.auditActorId,
    before: safeCompetitor(before),
    projectId: project.id,
    targetId: requiredPublicId(before.publicId),
    targetType: "competitor",
  });
  revalidateCompetitorViews();

  return { removed: true };
}
