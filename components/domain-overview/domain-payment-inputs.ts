import type { DomainOverviewReport } from "@/lib/domain-overview/types";

export function domainHistoryPaymentInput(projectId: string, report: DomainOverviewReport) {
  return {
    projectId,
    target: report.target,
    scopeOverride: report.scope,
    locationCode: report.locationCode,
    languageCode: report.languageCode,
    fresh: false,
    paymentOptionId: report.payment?.option.id ?? report.originalPayment?.option.id,
  };
}

export function domainPagePaymentInput(
  projectId: string,
  report: DomainOverviewReport,
  offset: number,
) {
  return { ...domainHistoryPaymentInput(projectId, report), limit: 100, offset };
}
