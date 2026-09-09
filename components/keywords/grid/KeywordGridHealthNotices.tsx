import { AlertBanner } from "@/components/ui/AlertBanner";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";

export type CheckHealthView = {
  budget: { capCents: number; exhausted: boolean; spentCents: number };
  failed24h: {
    count: number;
    latest: {
      error: string | null;
      errorCode: string | null;
      keyword: string;
      provider: string;
    } | null;
  };
  providerRate: CostRateInfo;
};

type KeywordGridHealthNoticesProps = {
  checkFailed: boolean;
  checkHealth?: CheckHealthView;
  onDismissFailure: () => void;
  onRunChecks: (keywordIds: string[]) => void;
  projectRef: string;
  rows: KeywordRow[];
};

function failureTitle(checkFailed: boolean, count: number) {
  if (count > 0) {
    return `${count} ${count === 1 ? "rank check" : "rank checks"} failed in the last 24 hours.`;
  }
  return checkFailed ? "Some rank checks failed to start." : null;
}

function failureDetail(checkFailed: boolean, health?: CheckHealthView) {
  const latest = health?.failed24h.latest;
  if (latest) {
    return `${latest.keyword}: ${providerFailurePresentation(latest.errorCode).message}`;
  }
  return checkFailed ? "Retry the filtered keywords to start the remaining checks." : null;
}

export function KeywordGridHealthNotices({
  checkFailed,
  checkHealth,
  onDismissFailure,
  onRunChecks,
  projectRef: _projectRef,
  rows,
}: Readonly<KeywordGridHealthNoticesProps>) {
  const failureCount = checkHealth?.failed24h.count ?? 0;
  const title = failureTitle(checkFailed, failureCount);

  return (
    <>
      {title ? (
        <AlertBanner
          action={{
            icon: "retry",
            label: "Retry",
            onClick: () => onRunChecks(rows.map((row) => row.id)),
          }}
          detail={failureDetail(checkFailed, checkHealth)}
          onDismiss={failureCount === 0 ? onDismissFailure : undefined}
          tint="red"
          title={title}
        />
      ) : null}
    </>
  );
}
