import type {
  DomainOverviewResult,
  DomainRankMetrics,
  HistoricalOverviewResult,
  RelevantPageRow,
  RelevantPagesResult,
} from "@/lib/providers/types";
import {
  DataForSeoBillingError,
  DataForSeoError,
  DataForSeoValidationError,
  noSearchResults,
  validationFailure,
} from "./dataforseo-errors";
import { type DataForSeoResponse, dataForSeoResponseCostCents } from "./dataforseo-payload";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sourceDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) {
    return null;
  }
  return `${value}T00:00:00.000Z`;
}

function pagePath(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    return new URL(trimmed).pathname || "/";
  } catch {
    return null;
  }
}

function task(data: unknown) {
  const tasks = record(data).tasks;
  return Array.isArray(tasks) ? record(tasks[0]) : {};
}

function result(data: unknown) {
  const rows = task(data).result;
  return Array.isArray(rows) ? record(rows[0]) : {};
}

function responseCostCents(data: unknown) {
  return dataForSeoResponseCostCents(data as DataForSeoResponse);
}

function assertSuccess(data: unknown) {
  const root = record(data);
  const currentTask = task(data);
  const statusCode = number(currentTask.status_code || root.status_code);
  const message = string(currentTask.status_message || root.status_message);
  if (statusCode === 20000) return "success" as const;
  if (noSearchResults(statusCode, message)) return "empty" as const;
  const chargedCost = responseCostCents(data);
  const costCents = chargedCost > 0 ? chargedCost : null;
  if (
    (statusCode >= 40200 && statusCode < 40300) ||
    /balance|billing|payment required/i.test(message)
  ) {
    throw new DataForSeoBillingError(message || "Provider billing failed.", costCents);
  }
  if (validationFailure(message)) {
    throw new DataForSeoValidationError(message || "Provider validation failed.", costCents);
  }
  throw new DataForSeoError(
    message || "DataForSEO domain overview request failed.",
    false,
    undefined,
    costCents,
  );
}

function organicMetrics(item: JsonRecord): DomainRankMetrics | null {
  const metrics = record(item.metrics);
  const organic = record(metrics.organic);
  if (!organic || Object.keys(organic).length === 0) return null;
  const paidTrafficCost = finiteOrNull(organic.estimated_paid_traffic_cost);
  return {
    count: finiteOrNull(organic.count),
    etv: finiteOrNull(organic.etv),
    estimatedTrafficCostCents: paidTrafficCost === null ? null : Math.round(paidTrafficCost * 100),
    isDown: number(organic.is_down),
    isLost: number(organic.is_lost),
    isNew: number(organic.is_new),
    isUp: number(organic.is_up),
    pos1: number(organic.pos_1),
    pos11_20: number(organic.pos_11_20),
    pos21_30: number(organic.pos_21_30),
    pos2_3: number(organic.pos_2_3),
    pos31_40: number(organic.pos_31_40),
    pos41_50: number(organic.pos_41_50),
    pos4_10: number(organic.pos_4_10),
    pos51_60: number(organic.pos_51_60),
    pos61_70: number(organic.pos_61_70),
    pos71_80: number(organic.pos_71_80),
    pos81_90: number(organic.pos_81_90),
    pos91_100: number(organic.pos_91_100),
  };
}

export function dataForSeoDomainOverview(data: unknown): DomainOverviewResult {
  const status = assertSuccess(data);
  const page = result(data);
  const items = page.items;
  const firstItem = Array.isArray(items) ? record(items[0]) : {};
  return {
    costCents: responseCostCents(data),
    metrics: status === "empty" ? null : organicMetrics(firstItem),
    sourceSnapshotAt: null,
  };
}

export function dataForSeoLabsSourceSnapshotAt(data: unknown) {
  assertSuccess(data);
  return sourceDate(record(result(data).google).date_update);
}

export function dataForSeoHistoricalOverview(data: unknown): HistoricalOverviewResult {
  const status = assertSuccess(data);
  const items = result(data).items;
  const rows =
    status === "empty" || !Array.isArray(items)
      ? []
      : items.flatMap((raw) => {
          const item = record(raw);
          const year = finiteOrNull(item.year);
          const month = finiteOrNull(item.month);
          if (
            year === null ||
            month === null ||
            !Number.isInteger(year) ||
            year < 2020 ||
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12
          ) {
            return [];
          }
          const metrics = organicMetrics(item);
          if (metrics === null) return [];
          return [{ year, month, metrics }];
        });
  return { costCents: responseCostCents(data), rows };
}

export function dataForSeoRelevantPages(data: unknown): RelevantPagesResult {
  const status = assertSuccess(data);
  const page = result(data);
  const items = Array.isArray(page.items) ? page.items : [];
  const rows =
    status === "empty"
      ? []
      : items.flatMap((raw) => {
          const item = record(raw);
          const path = pagePath(item.page_address);
          if (!path) return [];
          const metrics = organicMetrics(item);
          if (metrics === null) return [];
          return [
            {
              etv: metrics.etv,
              // The endpoint does not return top-keyword or page-delta fields.
              etvDeltaPct: null,
              keywordCount: metrics.count,
              path,
              topKeyword: null,
              topKeywordPosition: null,
            } satisfies RelevantPageRow,
          ];
        });
  const totalCountRaw = finiteOrNull(page.total_count);
  const totalCount =
    totalCountRaw !== null && Number.isInteger(totalCountRaw) && totalCountRaw >= 0
      ? totalCountRaw
      : 0;
  return { consumedCount: items.length, costCents: responseCostCents(data), rows, totalCount };
}
