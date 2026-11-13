import {
  HISTORY_PAGE_SIZE,
  HISTORY_PAGE_TAKE,
  HISTORY_SUGGESTION_TAKE,
  type HistoryChip,
  type HistoryFilter,
  type HistoryPage,
  type HistoryRow,
} from "./contract";
import { groupHistoryByDay } from "./group-by-day";

export type HistoryCursor = { at: string; id: string };

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeHistoryCursor(value: string | null): HistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      at?: unknown;
      id?: unknown;
      key?: unknown;
    };
    const id = typeof parsed.id === "string" ? parsed.id : parsed.key;
    if (typeof parsed.at !== "string" || typeof id !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.at))) return null;
    return { at: parsed.at, id };
  } catch {
    return null;
  }
}

export function historyTake(limit: number | undefined) {
  return limit === HISTORY_SUGGESTION_TAKE ? HISTORY_SUGGESTION_TAKE : HISTORY_PAGE_TAKE;
}

export function historyPageSize(limit: number | undefined) {
  return limit === HISTORY_SUGGESTION_TAKE ? HISTORY_SUGGESTION_TAKE : HISTORY_PAGE_SIZE;
}

export function filterValue(filters: readonly HistoryFilter[], facet: HistoryFilter["facet"]) {
  return filters.find((filter) => filter.facet === facet)?.value ?? null;
}

export function pinnedOnly(filters: readonly HistoryFilter[]) {
  return filters.some((filter) => filter.facet === "pinned" && filter.value === "1");
}

/** Day groups for one database page. Search, facets and totals are already applied. */
export function assembleHistoryPage(input: {
  chips: HistoryChip[];
  nextCursor: string | null;
  now?: Date;
  pinnedCount: number;
  rows: readonly HistoryRow[];
  timeZone: string;
  total: number;
}): HistoryPage {
  return {
    chips: input.chips,
    groups: groupHistoryByDay(input.rows, input.timeZone, input.now ?? new Date()),
    nextCursor: input.nextCursor,
    pinnedCount: input.pinnedCount,
    timeZone: input.timeZone,
    total: input.total,
  };
}

export function orderedHistoryChips(input: {
  devices?: Iterable<string>;
  engines?: Iterable<string>;
  markets?: Iterable<string>;
  modes?: Iterable<string>;
}): HistoryChip[] {
  const chips: HistoryChip[] = [];
  const devices = new Set(input.devices ?? []);
  for (const value of ["desktop", "mobile"]) {
    if (devices.has(value)) chips.push({ facet: "device", value });
  }
  for (const value of [...(input.modes ?? [])].sort()) chips.push({ facet: "mode", value });
  for (const value of [...(input.engines ?? [])].sort()) chips.push({ facet: "engine", value });
  for (const value of [...(input.markets ?? [])].sort((left, right) => left.localeCompare(right))) {
    chips.push({ facet: "market", value });
  }
  return chips;
}

export function sliceHistoryIds<T extends { at: Date; id: string }>(
  rows: readonly T[],
  limit: number | undefined,
) {
  const pageSize = historyPageSize(limit);
  const visible = rows.slice(0, pageSize);
  const last = visible.at(-1);
  const hasMore = limit !== HISTORY_SUGGESTION_TAKE && rows.length > pageSize;
  return {
    nextCursor:
      hasMore && last ? encodeHistoryCursor({ at: last.at.toISOString(), id: last.id }) : null,
    rows: visible,
  };
}
