import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { costCatalog } from "./catalog";
import type { CostItemInput } from "./input";
import { costShareUpdatePlan } from "./monthly";
import { buildPriceChanges } from "./schedule";

export class CostItemError extends Error {
  constructor(readonly code: "missing" | "project_owner" | "unknown_catalog" | "share_precision") {
    super(
      code === "share_precision"
        ? "This allocation cannot preserve the other projects' rounded costs."
        : code === "project_owner"
          ? "That project belongs to another account."
          : code === "unknown_catalog"
            ? "That tool is not in the catalog."
            : "Cost item not found.",
    );
    this.name = "CostItemError";
  }
}

type LinkedProject = { id: string; ownerId: string; publicId: string };
type Scope = { id: string; ownerId: string; publicId: string };

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dayKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function utcDayKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function canonical(input: CostItemInput) {
  const entry = input.catalogKey
    ? costCatalog().find((item) => item.key === input.catalogKey)
    : null;
  if (input.catalogKey && !entry) throw new CostItemError("unknown_catalog");
  return {
    ...input,
    catalogKey: entry?.key ?? null,
    kind: entry?.kind ?? input.kind,
    name: entry?.name ?? input.name,
  };
}

function nested(input: CostItemInput, projects: readonly LinkedProject[]) {
  const ids = new Map(projects.map((project) => [project.publicId, project.id]));
  const changes = buildPriceChanges({
    amountMinor: input.amountMinor,
    discount: input.discount,
    startedOn: input.startedOn,
    trialUntil: input.trialUntil,
  });
  return {
    amountMinor: input.amountMinor,
    billing: input.billing,
    catalogKey: input.catalogKey,
    currency: input.currency,
    kind: input.kind,
    name: input.name,
    planLabel: input.planLabel,
    priceChanges: {
      create: changes.map((change) => ({
        amountMinor: change.amountMinor,
        effectiveFrom: utcDate(change.effectiveFrom),
        reason: change.reason,
      })),
    },
    projects: {
      create: input.projects.map((link) => {
        const projectId = ids.get(link.projectPublicId);
        if (!projectId) throw new CostItemError("missing");
        return { basisPoints: link.basisPoints, projectId };
      }),
    },
    split: input.split,
    startedOn: utcDate(input.startedOn),
  };
}

function auditFields(input: CostItemInput, publicId: string, endedOn: string | null) {
  return {
    amountMinor: input.amountMinor,
    billing: input.billing,
    currency: input.currency,
    endedOn,
    id: publicId,
    kind: input.kind,
    name: input.name,
    projectIds: input.projects.map((link) => link.projectPublicId).sort(),
    split: input.split,
    startedOn: input.startedOn,
  };
}

function target(publicId: string) {
  return requiredPublicAuditId(publicId, "cst", "Cost item");
}

async function existing(
  ownerId: string,
  projectId: string,
  publicId: string,
  db: Pick<typeof prisma, "costItem"> = prisma,
) {
  const item = await db.costItem.findFirst({
    include: {
      projects: {
        select: { projectId: true, basisPoints: true, project: { select: { publicId: true } } },
      },
    },
    where: { ownerId, projects: { some: { projectId } }, publicId },
  });
  if (!item) throw new CostItemError("missing");
  return item;
}

function previous(item: Awaited<ReturnType<typeof existing>>): CostItemInput {
  return {
    amountMinor: item.amountMinor,
    billing: item.billing,
    catalogKey: item.catalogKey,
    currency: item.currency as CostItemInput["currency"],
    discount: null,
    kind: item.kind,
    name: item.name,
    planLabel: item.planLabel,
    projectId: item.projects[0]?.project.publicId ?? "",
    projects: item.projects.map((link) => ({
      basisPoints: link.basisPoints,
      projectPublicId: link.project.publicId,
    })),
    split: item.split,
    startedOn: dayKey(item.startedOn) ?? "",
    trialUntil: null,
  };
}

export async function insertCostItem(
  actorId: string,
  project: Scope,
  projects: readonly LinkedProject[],
  input: CostItemInput,
) {
  const item = canonical(input);
  const publicId = makePublicId("cst");
  await prisma.$transaction(async (tx) => {
    await tx.costItem.create({
      data: { ...nested(item, projects), createdById: actorId, ownerId: project.ownerId, publicId },
    });
    await writeAudit(
      {
        action: "cost_item.create",
        actorId,
        after: auditFields(item, publicId, null),
        projectId: project.id,
        targetId: target(publicId),
        targetType: "cost_item",
      },
      tx,
    );
  });
}

export async function replaceCostItem(
  actorId: string,
  project: Scope,
  projects: readonly LinkedProject[],
  input: CostItemInput,
) {
  if (!input.publicId) throw new CostItemError("missing");
  const item = canonical(input);
  const publicId = input.publicId;
  const data = nested(item, projects);
  await prisma.$transaction(async (tx) => {
    const current = await existing(project.ownerId, project.id, publicId, tx);
    const endedOn = dayKey(current.endedOn);
    const mine = item.projects.find((link) => link.projectPublicId === project.publicId);
    const { basisPoints, shares, keepEqual, blocked } = costShareUpdatePlan(
      current,
      project.id,
      item.split,
      mine?.basisPoints ?? 0,
    );
    if (blocked) throw new CostItemError("share_precision");
    if (current.split === "equal" && !keepEqual) {
      for (const share of shares) {
        await tx.costItemProject.updateMany({
          data: { basisPoints: share.basisPoints },
          where: { costItemId: current.id, projectId: share.projectId, basisPoints: null },
        });
      }
    }
    const { projects: _submittedProjects, ...shared } = data;
    await tx.costItem.update({
      data: {
        ...shared,
        split: keepEqual ? "equal" : "percent",
        priceChanges: { deleteMany: {}, ...data.priceChanges },
        projects: keepEqual
          ? {}
          : basisPoints > 0
            ? {
                upsert: {
                  where: {
                    costItemId_projectId: { costItemId: current.id, projectId: project.id },
                  },
                  create: { projectId: project.id, basisPoints },
                  update: { basisPoints },
                },
              }
            : { deleteMany: { projectId: project.id } },
      },
      where: { id: current.id },
    });
    await writeAudit(
      {
        action: "cost_item.update",
        actorId,
        after: auditFields(
          {
            ...item,
            split: keepEqual ? "equal" : "percent",
            projects: current.projects
              .filter((link) => link.projectId !== project.id || basisPoints > 0)
              .map((link) => ({
                basisPoints: link.projectId === project.id ? basisPoints : link.basisPoints,
                projectPublicId: link.project.publicId,
              })),
          },
          current.publicId,
          endedOn,
        ),
        before: auditFields(previous(current), current.publicId, endedOn),
        projectId: project.id,
        targetId: target(current.publicId),
        targetType: "cost_item",
      },
      tx,
    );
  });
}

export async function endCostItem(actorId: string, project: Scope, publicId: string) {
  const current = await existing(project.ownerId, project.id, publicId);
  const endedOn = utcDayKey();
  await prisma.$transaction(async (tx) => {
    await tx.costItem.update({ data: { endedOn: utcDate(endedOn) }, where: { id: current.id } });
    await writeAudit(
      {
        action: "cost_item.end",
        actorId,
        after: { endedOn, id: current.publicId },
        before: { endedOn: dayKey(current.endedOn), id: current.publicId },
        projectId: project.id,
        targetId: target(current.publicId),
        targetType: "cost_item",
      },
      tx,
    );
  });
}

export async function removeCostItem(actorId: string, project: Scope, publicId: string) {
  const current = await existing(project.ownerId, project.id, publicId);
  await prisma.$transaction(async (tx) => {
    await writeAudit(
      {
        action: "cost_item.delete",
        actorId,
        before: { id: current.publicId, name: current.name },
        projectId: project.id,
        targetId: target(current.publicId),
        targetType: "cost_item",
      },
      tx,
    );
    await tx.costItem.delete({ where: { id: current.id } });
  });
}
