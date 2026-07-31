import "server-only";

import { whereComparableTo } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import type { AlertTrendCheck } from "./downtrend";

type HistoryInput = {
  current: AlertTrendCheck;
  keywordId: string;
};

function appendCurrent(rows: AlertTrendCheck[], current: AlertTrendCheck) {
  if (!current.rankCheckId || rows.some((row) => row.rankCheckId === current.rankCheckId)) {
    return rows;
  }
  return [...rows, current]
    .sort((a, b) => (a.checkedAt?.getTime() ?? 0) - (b.checkedAt?.getTime() ?? 0))
    .slice(-5);
}

async function loadComparableHistory({ current, keywordId }: HistoryInput) {
  const comparableWhere = whereComparableTo({
    normalizationVersion: current.normalizationVersion ?? null,
    requestedDepth: current.requestedDepth ?? null,
  });
  if (!comparableWhere) return appendCurrent([], current);

  const rows = await prisma.rankCheck.findMany({
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    select: {
      checkedAt: true,
      id: true,
      normalizationVersion: true,
      position: true,
      requestedDepth: true,
    },
    take: 5,
    where: { keywordId, ...comparableWhere },
  });
  return appendCurrent(
    rows
      .map((row) => ({
        checkedAt: row.checkedAt,
        normalizationVersion: row.normalizationVersion,
        position: row.position,
        rankCheckId: row.id,
        requestedDepth: row.requestedDepth,
      }))
      .reverse(),
    current,
  );
}

export async function loadRecentCompletedCheckHistories(inputs: HistoryInput[]) {
  const histories = await Promise.all(
    inputs.map(async (input) => [input.keywordId, await loadComparableHistory(input)] as const),
  );
  return new Map(histories);
}

export async function loadRecentCompletedChecks(keywordId: string, current: AlertTrendCheck) {
  const histories = await loadRecentCompletedCheckHistories([{ current, keywordId }]);
  return histories.get(keywordId) ?? [];
}
