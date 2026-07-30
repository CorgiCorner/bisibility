import type {
  BacklinkFlag,
  BacklinkHistoryResult,
  BacklinkRow,
  BacklinkRowsResult,
  BacklinkSummary,
  BacklinkSummaryResult,
} from "@/lib/providers/types";
import {
  DataForSeoBillingError,
  DataForSeoError,
  DataForSeoValidationError,
  validationFailure,
} from "./dataforseo-errors";
import { type DataForSeoResponse, dataForSeoResponseCostCents } from "./dataforseo-payload";

type JsonRecord = Record<string, unknown>;

const EMPTY_SUMMARY: BacklinkSummary = {
  backlinksTotal: 0,
  brokenBacklinks: 0,
  brokenPages: 0,
  dofollowPct: 0,
  domainRank: 0,
  lostBacklinks: 0,
  lostReferringDomains: 0,
  newBacklinks: 0,
  newReferringDomains: 0,
  referringDomainsTotal: 0,
  referringPages: 0,
  spamScore: 0,
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function coalescedNumber(item: JsonRecord, primary: string, fallback: string) {
  return number(item[primary] ?? item[fallback]);
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
  if (statusCode === 40501 && /no search results/i.test(message)) return "empty" as const;
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
    message || "DataForSEO backlinks request failed.",
    false,
    undefined,
    costCents,
  );
}

function summaryFrom(item: JsonRecord): BacklinkSummary {
  const referringPages = number(item.referring_pages ?? item.reffering_pages);
  const nofollowPages = number(item.referring_pages_nofollow ?? item.reffering_pages_nofollow);
  const dofollowPct =
    referringPages > 0 ? Math.round(((referringPages - nofollowPages) / referringPages) * 100) : 0;
  return {
    backlinksTotal: number(item.backlinks),
    brokenBacklinks: number(item.broken_backlinks),
    brokenPages: number(item.broken_pages),
    dofollowPct: Math.max(0, Math.min(100, dofollowPct)),
    domainRank: number(item.rank),
    lostBacklinks: number(item.lost_backlinks),
    lostReferringDomains: coalescedNumber(item, "lost_referring_domains", "lost_reffering_domains"),
    newBacklinks: number(item.new_backlinks),
    newReferringDomains: coalescedNumber(item, "new_referring_domains", "new_reffering_domains"),
    referringDomainsTotal: coalescedNumber(item, "referring_domains", "reffering_domains"),
    referringPages,
    spamScore: number(item.backlinks_spam_score),
  };
}

export function dataForSeoBacklinksSummary(data: unknown): BacklinkSummaryResult {
  const status = assertSuccess(data);
  return {
    costCents: responseCostCents(data),
    summary: status === "empty" ? { ...EMPTY_SUMMARY } : summaryFrom(result(data)),
  };
}

export function dataForSeoBacklinksHistory(data: unknown): BacklinkHistoryResult {
  const status = assertSuccess(data);
  const items = result(data).items;
  const rows =
    status === "empty" || !Array.isArray(items)
      ? []
      : items.flatMap((raw) => {
          const item = record(raw);
          const month = string(item.date).slice(0, 7);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
          return [
            {
              lostLinks: number(item.lost_backlinks),
              lostReferringDomains: coalescedNumber(
                item,
                "lost_referring_domains",
                "lost_reffering_domains",
              ),
              month,
              newLinks: number(item.new_backlinks),
              newReferringDomains: coalescedNumber(
                item,
                "new_referring_domains",
                "new_reffering_domains",
              ),
            },
          ];
        });
  return { costCents: responseCostCents(data), rows };
}

function backlinkFlags(item: JsonRecord): BacklinkFlag[] {
  const rawAttributes = [item.rel_attributes, item.attributes].flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  const flags = new Set<BacklinkFlag>();
  for (const value of rawAttributes) {
    if (value === "nofollow" || value === "ugc" || value === "sponsored") flags.add(value);
  }
  if (item.item_type === "image") flags.add("image");
  if (number(item.links_count) >= 100) flags.add("sitewide");
  return [...flags];
}

function backlinkRow(raw: unknown): BacklinkRow {
  const item = record(raw);
  const isLost = item.is_lost === true;
  return {
    anchor: string(item.anchor),
    domainAuthority: number(item.domain_from_rank),
    firstSeen: nullableString(item.first_seen),
    flags: backlinkFlags(item),
    linksCount: number(item.links_count),
    lostAt: nullableString(item.lost_date),
    sourceDomain: string(item.domain_from),
    sourceUrl: string(item.url_from),
    spamScore: coalescedNumber(item, "backlink_spam_score", "backlinks_spam_score"),
    status: isLost ? "lost" : item.is_new === true ? "new" : "active",
    targetUrl: string(item.url_to),
  };
}

export function dataForSeoBacklinksRows(data: unknown): BacklinkRowsResult {
  const status = assertSuccess(data);
  const page = result(data);
  const items = page.items;
  return {
    costCents: responseCostCents(data),
    rows: status === "empty" || !Array.isArray(items) ? [] : items.map(backlinkRow),
    totalCount: status === "empty" ? 0 : number(page.total_count),
  };
}
