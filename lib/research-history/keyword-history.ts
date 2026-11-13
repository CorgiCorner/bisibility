import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import { researchScopeForLocation } from "@/lib/research/scope";
import { locationLanguage } from "@/lib/serp/location";
import { HISTORY_SCAN_BOUND, type HistoryQuery, type HistoryRow } from "./contract";
import { historyCostFromCents, historyCostFromReceipt } from "./cost";
import {
  assembleHistoryPage,
  decodeHistoryCursor,
  filterValue,
  historyTake,
  orderedHistoryChips,
  pinnedOnly,
  sliceHistoryIds,
} from "./page";
import { projectHistoryTimeZone } from "./pins";
import { countValue, ilike, keysetSql } from "./sql";

const modeList = ["auto", "ideas", "related", "suggestions"] as const;

function scopeLabel(countryCode: string, languageCode: string) {
  try {
    const language = locationLanguage(countryCode, languageCode);
    const scope = researchScopeForLocation({
      countryCode,
      languageCode: language.code,
      languageLabel: language.label,
    });
    return `${scope.countryName} / ${scope.languageLabel}`;
  } catch {
    return `${countryCode} / ${languageCode}`;
  }
}

function snapshotCost(sources: unknown) {
  if (!Array.isArray(sources) || sources.length === 0) return historyCostFromReceipt(undefined);
  const first = sources[0];
  const payment =
    first && typeof first === "object"
      ? historyCostFromReceipt((first as { _payment?: unknown })._payment)
      : null;
  if (payment && payment.kind !== "unknown") return payment;
  const cents = sources.map((source) => {
    if (
      !source ||
      typeof source !== "object" ||
      typeof (source as { costCents?: unknown }).costCents !== "number"
    ) {
      return null;
    }
    return (source as { costCents: number }).costCents;
  });
  if (cents.some((value) => value == null)) return { kind: "unknown" as const };
  const sum = cents.reduce<number>((total, value) => total + (value ?? 0), 0);
  const cached = sources.every(
    (source) =>
      Boolean(source) &&
      typeof source === "object" &&
      (source as { cached?: unknown }).cached === true,
  );
  if (cached || sum === 0) return { kind: "cached" as const };
  return historyCostFromCents(sum);
}

function modeSql(mode: string | null) {
  if (mode && modeList.includes(mode as KeywordResearchMode)) return Prisma.sql`mode = ${mode}`;
  return Prisma.sql`mode IN (${Prisma.join([...modeList])})`;
}

function scopeSql(countryCode: string | null, languageCode: string | null) {
  if (!countryCode || !languageCode) return Prisma.sql`TRUE`;
  return Prisma.sql`"countryCode" = ${countryCode} AND "languageCode" = ${languageCode}`;
}

function pinSql(userId: string, enabled: boolean) {
  if (!enabled) return Prisma.sql`TRUE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM research_history_pins pin
    WHERE pin."userId" = ${userId}
      AND pin."projectId" = keyword_research_snapshots."projectId"
      AND pin.surface = 'keyword_research'::"ResearchHistorySurface"
      AND pin."itemKey" = keyword_research_snapshots."requestKey"
  )`;
}

export async function readKeywordResearchHistory(
  projectId: string,
  userId: string,
  request: HistoryQuery,
  now?: Date,
) {
  const cursor = decodeHistoryCursor(request.cursor);
  const mode = filterValue(request.filters, "mode");
  const scope = filterValue(request.filters, "market");
  const searched = Prisma.sql`"projectId" = ${projectId} AND ${modeSql(null)} AND ${ilike(Prisma.sql`seed`, request.query)}`;
  const pairs = await prisma.keywordResearchSnapshot.findMany({
    distinct: ["countryCode", "languageCode"],
    select: { countryCode: true, languageCode: true },
    take: HISTORY_SCAN_BOUND,
    where: {
      mode: { in: [...modeList] },
      projectId,
      ...(request.query.trim()
        ? { seed: { contains: request.query.trim(), mode: "insensitive" as const } }
        : {}),
    },
  });
  const selected = scope
    ? pairs.find((pair) => scopeLabel(pair.countryCode, pair.languageCode) === scope)
    : null;
  const matched = Prisma.sql`
    ${searched}
    AND ${modeSql(mode)}
    AND ${scopeSql(selected?.countryCode ?? null, selected?.languageCode ?? null)}
    AND ${scope && !selected ? Prisma.sql`FALSE` : Prisma.sql`TRUE`}
    AND ${pinSql(userId, pinnedOnly(request.filters))}
  `;
  const take = historyTake(request.limit);
  const [timeZone, idRows, totals, pinnedTotals, modes] = await Promise.all([
    projectHistoryTimeZone(projectId),
    prisma.$queryRaw<Array<{ fetchedAt: Date; id: string }>>`
      SELECT id, "fetchedAt" AS "fetchedAt"
      FROM keyword_research_snapshots
      WHERE ${matched} AND ${keysetSql("fetchedAt", cursor)}
      ORDER BY "fetchedAt" DESC, id DESC
      LIMIT ${take}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM keyword_research_snapshots WHERE ${matched}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM keyword_research_snapshots
      WHERE ${searched} AND ${pinSql(userId, true)}
    `,
    prisma.keywordResearchSnapshot.findMany({
      distinct: ["mode"],
      select: { mode: true },
      take: HISTORY_SCAN_BOUND,
      where: {
        mode: { in: [...modeList] },
        projectId,
        ...(request.query.trim()
          ? { seed: { contains: request.query.trim(), mode: "insensitive" as const } }
          : {}),
      },
    }),
  ]);
  const page = sliceHistoryIds(
    idRows.map((row) => ({ at: new Date(row.fetchedAt), id: row.id })),
    request.limit,
  );
  const snapshots =
    page.rows.length === 0
      ? []
      : await prisma.keywordResearchSnapshot.findMany({
          orderBy: [{ fetchedAt: "desc" }, { id: "desc" }],
          select: {
            countryCode: true,
            fetchedAt: true,
            id: true,
            languageCode: true,
            mode: true,
            requestKey: true,
            seed: true,
            sources: true,
          },
          take: page.rows.length,
          where: { id: { in: page.rows.map((row) => row.id) } },
        });
  const pins =
    snapshots.length === 0
      ? []
      : await prisma.researchHistoryPin.findMany({
          select: { itemKey: true },
          take: snapshots.length,
          where: {
            itemKey: { in: snapshots.map((snapshot) => snapshot.requestKey) },
            projectId,
            surface: "keyword_research",
            userId,
          },
        });
  const pinnedKeys = new Set(pins.map((pin) => pin.itemKey));
  const rows: HistoryRow[] = snapshots.flatMap((snapshot) => {
    if (!modeList.includes(snapshot.mode as KeywordResearchMode)) return [];
    return [
      {
        cost: snapshotCost(snapshot.sources),
        key: snapshot.requestKey,
        meta: {
          kind: "keyword" as const,
          mode: snapshot.mode,
          scope: scopeLabel(snapshot.countryCode, snapshot.languageCode),
        },
        occurredAt: snapshot.fetchedAt.toISOString(),
        pinned: pinnedKeys.has(snapshot.requestKey),
        title: snapshot.seed,
      },
    ];
  });
  return assembleHistoryPage({
    chips: orderedHistoryChips({
      markets: pairs.map((pair) => scopeLabel(pair.countryCode, pair.languageCode)),
      modes: modes.map((row) => row.mode),
    }),
    nextCursor: page.nextCursor,
    now,
    pinnedCount: countValue(pinnedTotals),
    rows,
    timeZone,
    total: countValue(totals),
  });
}
