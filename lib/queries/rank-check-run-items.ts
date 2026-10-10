import "server-only";

import { ApiNotFoundError } from "@/lib/api/errors";
import {
  decodeUnprefixedCursor,
  encodeUnprefixedCursor,
  parseLimit,
  splitPage,
} from "@/lib/api/pagination";
import { prisma } from "@/lib/db/prisma";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/rank-check/runs/contract";
import { normalizedObservationCompleteness } from "@/lib/serp/rank-depth";
import {
  ledgerActualCostCents,
  ledgerActualUnits,
  rankCheckRunTargetLedgerActuals,
} from "./rank-check-run-accounting";
import { iso, statusCsv } from "./rank-check-run-query-helpers";

export async function listRankCheckRunItems(projectId: string, publicId: string, url: URL) {
  const run = await prisma.rankCheckRun.findFirst({
    select: { id: true },
    where: { projectId, publicId, deletedAt: null },
  });
  if (!run) throw new ApiNotFoundError("Rank-check run not found.");
  const limit = parseLimit(url, 50, 200);
  const keywordPublicId = url.searchParams.get("keyword");
  const cursor = decodeUnprefixedCursor(url.searchParams.get("cursor"));
  const statuses = statusCsv(url.searchParams.get("status"), ITEM_STATUSES);
  const cursorDate = cursor ? new Date(cursor.t) : null;
  const cursorId = cursor?.public_id;
  const rows = await prisma.rankCheckRunItem.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      actualCostCents: true,
      blockedReason: true,
      createdAt: true,
      estimatedCostCents: true,
      finishedAt: true,
      id: true,
      keyword: {
        select: {
          device: true,
          location: true,
          locationRef: { select: { languageLabel: true } },
          publicId: true,
          text: true,
        },
      },
      notBefore: true,
      rankCheck: {
        select: {
          billingUnits: true,
          costCents: true,
          errorCode: true,
          id: true,
          observationRun: { select: { completeness: true } },
          position: true,
          provider: true,
          publicId: true,
          rankingUrl: true,
          requestedDepth: true,
        },
      },
      startedAt: true,
      status: true,
    },
    take: limit + 1,
    where: {
      runId: run.id,
      ...(keywordPublicId ? { keyword: { publicId: keywordPublicId } } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(cursorDate
        ? {
            OR: [
              { createdAt: { gt: cursorDate } },
              { createdAt: cursorDate, id: { gt: cursorId } },
            ],
          }
        : {}),
    },
  });
  const { nextCursor, page } = splitPage(rows, limit, (row) =>
    encodeUnprefixedCursor({ publicId: row.id, timestamp: row.createdAt }),
  );
  const ledgerActuals = await rankCheckRunTargetLedgerActuals(projectId, run.id);
  return {
    data: page.map(({ createdAt, id, keyword: { locationRef, ...keyword }, ...row }) => {
      const storedRankCheck = row.rankCheck;
      const ledger = storedRankCheck ? ledgerActuals.get(storedRankCheck.id) : undefined;
      return {
        ...row,
        actualCostCents: ledgerActualCostCents(ledger, row.actualCostCents),
        finishedAt: iso(row.finishedAt),
        id: encodeUnprefixedCursor({ publicId: id, timestamp: createdAt }),
        keyword: { ...keyword, languageLabel: locationRef?.languageLabel ?? null },
        rankCheck: storedRankCheck
          ? {
              billingUnits: ledgerActualUnits(
                ledger,
                storedRankCheck.billingUnits,
                storedRankCheck.provider,
              ),
              costCents: ledgerActualCostCents(
                ledger,
                storedRankCheck.costCents === null ? null : Number(storedRankCheck.costCents),
              ),
              errorCode: storedRankCheck.errorCode,
              observationCompleteness: normalizedObservationCompleteness(
                storedRankCheck.observationRun?.completeness,
              ),
              position: storedRankCheck.position,
              provider: storedRankCheck.provider,
              publicId: storedRankCheck.publicId,
              rankingUrl: storedRankCheck.rankingUrl,
              requestedDepth: storedRankCheck.requestedDepth,
            }
          : null,
        notBefore: iso(row.notBefore),
        startedAt: iso(row.startedAt),
        status: row.status as ItemStatus,
      };
    }),
    nextCursor,
  };
}
