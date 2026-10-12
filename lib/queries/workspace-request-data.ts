import "server-only";

import { prisma } from "@/lib/db/prisma";
import { monthlySpendCents } from "@/lib/metering/usage-read";
import { monthStartUtc } from "@/lib/metering/utc-window";
import { rankCheckRateSelection, withRankCheckManualRate } from "@/lib/provider-rates/manual-rate";
import {
  providerChainWhere,
  serpProviderChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { cache } from "react";

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const getRequestProjectDefaults = perRequestCache((projectId: string) =>
  prisma.projectDefaults.findUnique({ where: { projectId } }),
);

export const getRequestPrimarySerpProvider = perRequestCache(async (projectId: string) => {
  const connection = await prisma.providerConnection.findFirst({
    orderBy: serpProviderChainOrderBy(),
    select: { credentialSource: true, rates: rankCheckRateSelection, id: true, provider: true },
    where: { ...providerChainWhere("serp"), projectId },
  });
  return connection ? withRankCheckManualRate(connection) : null;
});

export const getRequestSerpProviderChain = perRequestCache(async (projectId: string) => {
  const connections = await prisma.providerConnection.findMany({
    orderBy: serpProviderChainOrderBy(),
    select: {
      credentialSource: true,
      rates: rankCheckRateSelection,
      id: true,
      priority: true,
      provider: true,
    },
    where: { ...providerChainWhere("serp"), projectId },
  });
  return connections.map(withRankCheckManualRate);
});

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
