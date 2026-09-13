import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";

export async function listOverviewHeaderMarkets(projectRef: string) {
  const { project } = await requireReadableProject(projectRef);
  const markets = await prisma.projectMarket.findMany({
    orderBy: [{ location: { displayName: "asc" } }, { location: { languageLabel: "asc" } }],
    select: {
      locationId: true,
      location: { select: { displayName: true, languageLabel: true } },
    },
    where: { projectId: project.id, status: "active" },
  });
  return markets.map((market) => ({
    label: market.location.displayName,
    secondary: market.location.languageLabel,
    value: market.locationId,
  }));
}
