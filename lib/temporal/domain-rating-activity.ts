import "server-only";

import { setTimeout } from "node:timers/promises";
import { prisma } from "../db/prisma";
import { collectDomainRating } from "../domain-rating/collect";

export async function collectDomainRatingBatchActivity(cursor: string | null) {
  const projects = await prisma.project.findMany({
    where: {
      owner: { deactivatedAt: null },
      domainRatingEnabled: true,
      isSample: false,
      writeMode: "active",
      domain: { not: null },
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 20,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  for (const project of projects) {
    const result = await collectDomainRating(project.id);
    if (result === "succeeded" || result === "failed") await setTimeout(1_000);
  }
  return projects.length === 20 ? (projects.at(-1)?.id ?? null) : null;
}
