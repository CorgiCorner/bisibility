import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { comparisonKeyword, parseComparisonSnapshot } from "./model";
import type { ComparisonRun } from "./types";

export type PlaygroundHistoryEntry = Pick<ComparisonRun, "id" | "createdAt" | "keyword" | "search">;
export type PlaygroundHistoryPage = {
  entries: PlaygroundHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
};
export async function readPlaygroundHistory(
  projectId: string,
  query: string,
  page: number,
): Promise<PlaygroundHistoryPage> {
  const pageSize = 10;
  const where: Prisma.ProviderComparisonRunWhereInput = {
    projectId,
    keywordId: null,
    AND: [
      { snapshot: { path: ["version"], equals: 2 } },
      ...(query
        ? [{ snapshot: { path: ["text"], string_contains: query, mode: "insensitive" as const } }]
        : []),
    ],
  };
  const [total, rows] = await prisma.$transaction([
    prisma.providerComparisonRun.count({ where }),
    prisma.providerComparisonRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page * pageSize,
      take: pageSize,
      select: { id: true, createdAt: true, snapshot: true },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    entries: rows.map((row) => {
      const snapshot = parseComparisonSnapshot(row.snapshot);
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        keyword: comparisonKeyword(snapshot),
        ...(snapshot.locationKey
          ? {
              search: {
                locationKey: snapshot.locationKey,
                locationKind: snapshot.locationKind ?? "country",
                countryCode: snapshot.location.gl.toUpperCase(),
                language: snapshot.location.hl,
              },
            }
          : {}),
      };
    }),
  };
}
