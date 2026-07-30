import "server-only";

import { prisma } from "@/lib/db/prisma";
import { monthlySpendCents, monthStartUtc } from "@/lib/rank-check/budget";
import {
  providerChainWhere,
  serpProviderChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { cache } from "react";

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const getRequestProjectDefaults = perRequestCache((projectId: string) =>
  prisma.projectDefaults.findUnique({ where: { projectId } }),
);

export const getRequestPrimarySerpProvider = perRequestCache((projectId: string) =>
  prisma.providerConnection.findFirst({
    orderBy: serpProviderChainOrderBy(),
    select: { costPerCheckCents: true, id: true, provider: true },
    where: { ...providerChainWhere("serp"), projectId },
  }),
);

export const getRequestSerpProviderChain = perRequestCache((projectId: string) =>
  prisma.providerConnection.findMany({
    orderBy: serpProviderChainOrderBy(),
    select: {
      costPerCheckCents: true,
      id: true,
      priority: true,
      provider: true,
    },
    where: { ...providerChainWhere("serp"), projectId },
  }),
);

const loadMonthlySpendCents = perRequestCache((projectId: string, monthStart: string) =>
  monthlySpendCents(projectId, new Date(monthStart)),
);

export function getRequestMonthlySpendCents(projectId: string, now = new Date()) {
  return loadMonthlySpendCents(projectId, monthStartUtc(now).toISOString());
}

export const getRequestKeywordDimensions = perRequestCache(async (projectId: string) => {
  const rows = await prisma.keyword.groupBy({
    _count: { _all: true },
    by: ["locationId", "device"],
    where: { projectId },
  });

  return {
    deviceCount: new Set(rows.map((row) => row.device)).size,
    devices: [...new Set(rows.map((row) => row.device))],
    keywordCount: rows.reduce((total, row) => total + row._count._all, 0),
    locationCount: new Set(rows.map((row) => row.locationId)).size,
  };
});
