import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ResearchHistorySurface } from "./contract";

export async function researchHistoryPinKeys(input: {
  projectId: string;
  surface: ResearchHistorySurface;
  userId: string;
}) {
  const rows = await prisma.researchHistoryPin.findMany({
    select: { itemKey: true },
    where: input,
  });
  return new Set(rows.map((row) => row.itemKey));
}

export async function projectHistoryTimeZone(projectId: string) {
  const defaults = await prisma.projectDefaults.findUnique({
    select: { timezone: true },
    where: { projectId },
  });
  return defaults?.timezone || "UTC";
}

export async function pinResearchHistory(input: {
  itemKey: string;
  projectId: string;
  surface: ResearchHistorySurface;
  userId: string;
}) {
  await prisma.researchHistoryPin.upsert({
    create: input,
    update: {},
    where: {
      userId_projectId_surface_itemKey: {
        itemKey: input.itemKey,
        projectId: input.projectId,
        surface: input.surface,
        userId: input.userId,
      },
    },
  });
}

export async function unpinResearchHistory(input: {
  itemKey: string;
  projectId: string;
  surface: ResearchHistorySurface;
  userId: string;
}) {
  await prisma.researchHistoryPin.deleteMany({ where: input });
}
