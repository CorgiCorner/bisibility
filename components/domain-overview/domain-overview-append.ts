import type {
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { Dispatch, SetStateAction } from "react";
import {
  type DomainOverviewUiOutcome,
  domainOverviewReportIdentity,
  reportFrom,
} from "./domain-overview-workspace-model";

export function providerConsumedCount(page: { consumedCount?: number; rows: unknown[] }) {
  const consumedCount = page.consumedCount;
  return typeof consumedCount === "number" &&
    Number.isSafeInteger(consumedCount) &&
    consumedCount >= 0
    ? consumedCount
    : page.rows.length;
}

function collectedState(
  report: DomainOverviewReport,
  keywordsOk: boolean,
  pagesOk: boolean,
): DomainOverviewReport["state"] {
  if (report.overview === null) return "no_data";
  return keywordsOk && pagesOk ? "ok" : "partial";
}

export function appendKeywords(
  setOutcome: Dispatch<SetStateAction<DomainOverviewUiOutcome | null>>,
  result: Extract<Awaited<ReturnType<LoadDomainKeywordsPageAction>>, { ok: true; data: unknown }>,
  expectedIdentity: string,
) {
  setOutcome((current) => {
    const report = reportFrom(current);
    if (!report || domainOverviewReportIdentity(report) !== expectedIdentity) return current;
    const previous = report.keywords.ok ? report.keywords.data : null;
    const rows = new Map(
      (previous?.rows ?? []).map((row) => [`${row.keyword}:${row.rankingUrl ?? ""}`, row]),
    );
    for (const row of result.data.rows) rows.set(`${row.keyword}:${row.rankingUrl ?? ""}`, row);
    return {
      ...report,
      cached: report.cached && result.cached,
      costCents: report.costCents,
      appendPayment: result.payment,
      state: previous ? report.state : collectedState(report, true, report.pages.ok),
      keywords: {
        ...result,
        data: {
          ...result.data,
          consumedCount:
            (previous ? providerConsumedCount(previous) : 0) + providerConsumedCount(result.data),
          rows: [...rows.values()],
        },
      },
    };
  });
}

export function appendPages(
  setOutcome: Dispatch<SetStateAction<DomainOverviewUiOutcome | null>>,
  result: Extract<Awaited<ReturnType<LoadDomainPagesPageAction>>, { ok: true; data: unknown }>,
  expectedIdentity: string,
) {
  setOutcome((current) => {
    const report = reportFrom(current);
    if (!report || domainOverviewReportIdentity(report) !== expectedIdentity) return current;
    const previous = report.pages.ok ? report.pages.data : null;
    const rows = new Map((previous?.rows ?? []).map((row) => [row.path, row]));
    for (const row of result.data.rows) rows.set(row.path, row);
    return {
      ...report,
      cached: report.cached && result.cached,
      costCents: report.costCents,
      appendPayment: result.payment,
      state: previous ? report.state : collectedState(report, report.keywords.ok, true),
      pages: {
        ...result,
        data: {
          ...result.data,
          consumedCount:
            (previous ? providerConsumedCount(previous) : 0) + providerConsumedCount(result.data),
          rows: [...rows.values()],
        },
      },
    };
  });
}
