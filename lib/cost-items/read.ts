import "server-only";

import { requireProjectScope } from "@/lib/actions/_shared";
import { canManageWorkspace, getProjectRole } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { monthlySpendCents } from "@/lib/metering/usage-read";
import { getQueryActor } from "@/lib/queries/_auth";
import { costCatalog } from "./catalog";
import { utcDayKey } from "./persist";
import { presentUsageCosts } from "./present";
import { suggestToolHref } from "./suggest-link-extension";
import type { UsageCostsView } from "./view";

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function readUsageCosts(projectPublicId: string): Promise<UsageCostsView> {
  const actor = await getQueryActor();
  const project = await requireProjectScope(
    actor,
    "read",
    projectPublicId,
    { type: "project" },
    { allowReadOnly: true },
  );
  const today = utcDayKey();
  const [items, owned, providerMinor] = await Promise.all([
    prisma.costItem.findMany({
      include: {
        priceChanges: { orderBy: { effectiveFrom: "asc" } },
        projects: {
          include: { project: { select: { id: true, name: true, publicId: true } } },
        },
      },
      orderBy: { name: "asc" },
      where: { ownerId: project.ownerId, projects: { some: { projectId: project.id } } },
    }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, publicId: true, writeMode: true },
      where: { ownerId: project.ownerId },
    }),
    monthlySpendCents(project.id),
  ]);
  const presented = presentUsageCosts({
    items: items.map((item) => ({
      amountMinor: item.amountMinor,
      billing: item.billing,
      catalogKey: item.catalogKey,
      currency: item.currency,
      endedOn: item.endedOn ? day(item.endedOn) : null,
      kind: item.kind,
      name: item.name,
      planLabel: item.planLabel,
      priceChanges: item.priceChanges.map((change) => ({
        amountMinor: change.amountMinor,
        effectiveFrom: day(change.effectiveFrom),
        reason: change.reason,
      })),
      projects: item.projects.map((link) => ({
        basisPoints: link.basisPoints,
        id: link.project.id,
        name: link.project.name,
        publicId: link.project.publicId,
      })),
      publicId: item.publicId,
      split: item.split,
      startedOn: day(item.startedOn),
    })),
    month: today.slice(0, 7),
    projectId: project.id,
    providerMinor,
    today,
  });
  const editable =
    project.writeMode === "active" && canManageWorkspace(getProjectRole(actor, project.id));
  return {
    canEdit: editable,
    catalog: costCatalog().map((entry) => ({ ...entry, plans: [...entry.plans] })),
    month: today.slice(0, 7),
    projectPublicId: project.publicId,
    projects: owned
      .filter(
        (item) => item.writeMode === "active" && canManageWorkspace(getProjectRole(actor, item.id)),
      )
      .map((item) => ({ name: item.name, publicId: item.publicId })),
    rows: presented.rows,
    suggestHref: suggestToolHref(),
    tiles: presented.tiles,
    today,
  };
}
