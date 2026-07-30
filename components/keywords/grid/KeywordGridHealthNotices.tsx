import { AlertBanner } from "@/components/ui";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";

export type CheckHealthView = {
  budget: { capCents: number; exhausted: boolean; spentCents: number };
  failed24h: {
    count: number;
    latest: { error: string | null; keyword: string; provider: string } | null;
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

const money = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function failureTitle(checkFailed: boolean, count: number) {
  if (count > 0) {
    return `${count} ${count === 1 ? "rank check" : "rank checks"} failed in the last 24 hours.`;
  }
  return checkFailed ? "Some rank checks failed to start." : null;
}

function failureDetail(checkFailed: boolean, health?: CheckHealthView) {
  const latest = health?.failed24h.latest;
  if (latest) {
    const error = latest.error ?? "No error details recorded.";
    return `${latest.keyword} / ${latest.provider}: ${error}`;
  }
  return checkFailed ? "Retry the filtered keywords to start the remaining checks." : null;
}

export function KeywordGridHealthNotices({
  checkFailed,
  checkHealth,
  onDismissFailure,
  onRunChecks,
  projectRef,
  rows,
}: Readonly<KeywordGridHealthNoticesProps>) {
  const failureCount = checkHealth?.failed24h.count ?? 0;
  const title = failureTitle(checkFailed, failureCount);
  const budget = checkHealth?.budget;

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
      {budget?.exhausted ? (
        <AlertBanner
          action={{
            href: appPath(projectRef, "checks"),
            icon: "arrow",
            label: "View check runs",
          }}
          detail={
            <>
              {`Spent ${money.format(budget.spentCents / 100)} of ${money.format(
                budget.capCents / 100,
              )} this month.`}{" "}
              <Link
                className="font-semibold text-accent hover:underline"
                href={`${appPath(projectRef, "settings")}#provider-usage`}
              >
                Raise the budget
              </Link>
            </>
          }
          tint="yellow"
          title="Rank checks paused - monthly budget reached."
        />
      ) : null}
    </>
  );
}
