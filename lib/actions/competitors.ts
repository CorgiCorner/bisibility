"use server";

import { writeAudit } from "@/lib/auth/audit";
import {
  addManagedCompetitorSchema,
  removeManagedCompetitorSchema,
  renameManagedCompetitorSchema,
} from "@/lib/competitors/types";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateCompetitorViews,
} from "./_shared";

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

async function competitorProjectScope(action: "create" | "delete" | "update", projectId: string) {
  const actor = await getActionActor();
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

export async function addManagedCompetitor(input: unknown) {
  const data = parseActionInput(addManagedCompetitorSchema, input);
  const { actor, project } = await competitorProjectScope("create", data.projectId);
  const existing = await prisma.competitor.findUnique({
    select: { domain: true, id: true, label: true, publicId: true },
    where: { projectId_domain: { domain: data.domain, projectId: project.id } },
  });
  if (existing) {
    throw new Error("This competitor is already managed.");
  }

  const competitor = await prisma.competitor.create({
    data: {
      domain: data.domain,
      label: data.label ?? null,
      projectId: project.id,
      publicId: makePublicId("cmp"),
    },
    select: { domain: true, id: true, label: true, publicId: true },
  });

  await writeAudit({
    action: "competitor.add",
    actorId: actor.id,
    after: safeCompetitor(competitor),
    projectId: project.id,
    targetId: requiredPublicId(competitor.publicId),
    targetType: "competitor",
  });
  revalidateCompetitorViews();

  return safeCompetitor(competitor);
}

export async function renameManagedCompetitor(input: unknown) {
  const data = parseActionInput(renameManagedCompetitorSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const before = await findManagedCompetitor(project.id, data.competitorId);
  const competitor = await prisma.competitor.update({
    data: { label: data.label },
    select: { domain: true, id: true, label: true, publicId: true },
    where: { id: before.id },
  });

  await writeAudit({
    action: "competitor.rename",
    actorId: actor.id,
    after: safeCompetitor(competitor),
    before: safeCompetitor(before),
    projectId: project.id,
    targetId: requiredPublicId(competitor.publicId),
    targetType: "competitor",
  });
  revalidateCompetitorViews();

  return safeCompetitor(competitor);
}

export async function removeManagedCompetitor(input: unknown) {
  const data = parseActionInput(removeManagedCompetitorSchema, input);
  const { actor, project } = await competitorProjectScope("delete", data.projectId);
  const before = await findManagedCompetitor(project.id, data.competitorId);

  await prisma.competitor.delete({ where: { id: before.id } });
  await writeAudit({
    action: "competitor.remove",
    actorId: actor.id,
    before: safeCompetitor(before),
    projectId: project.id,
    targetId: requiredPublicId(before.publicId),
    targetType: "competitor",
  });
  revalidateCompetitorViews();

  return { removed: true };
}
