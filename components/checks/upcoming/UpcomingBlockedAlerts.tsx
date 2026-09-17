import type { UpcomingBlockedGroup } from "@/lib/checks/contract";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/ssr/Gauge";
import { PauseIcon as Pause } from "@phosphor-icons/react/dist/ssr/Pause";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { findBlockedGroup } from "./upcoming-format";

export type UpcomingBlockedAlertsProps = {
  blocked: UpcomingBlockedGroup[];
  providerSettingsHref: string;
  timelineHref: string;
};

const actionClassName =
  "shrink-0 text-xs font-semibold text-accent-text outline-none hover:underline focus-visible:underline";

export function UpcomingBlockedAlerts({
  blocked,
  providerSettingsHref,
  timelineHref,
}: Readonly<UpcomingBlockedAlertsProps>) {
  const t = useTranslations("projectRankTracker.checks");
  const noProvider = findBlockedGroup(blocked, "no_provider");
  const migrationHold = findBlockedGroup(blocked, "migration_hold");
  const budgetExhausted = findBlockedGroup(blocked, "budget_exhausted");

  if (!noProvider && !migrationHold && !budgetExhausted) return null;

  return (
    <section aria-label={t("blockedScheduledChecks")} className="space-y-2.5">
      {noProvider ? (
        <div className="rounded-card border border-red/30 bg-red/8 p-3.5">
          <div className="flex items-start gap-2.5">
            <WarningCircle
              aria-hidden
              className="mt-0.5 shrink-0 text-red-text"
              size={17}
              weight="regular"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-semibold text-red-text">
                {t("checksWillNeverRun", { count: noProvider.keywordCount })}
              </p>
              <p className="mb-0 mt-1 text-xs text-fg-muted">
                {t("noProviderAssignedCount", { count: noProvider.keywordCount })}
              </p>
            </div>
            <Link className={actionClassName} href={providerSettingsHref}>
              {t("connect")}
            </Link>
          </div>
        </div>
      ) : null}

      {migrationHold ? (
        <div className="flex items-center gap-2.5 rounded-card border border-border bg-bg-sunken/65 px-3.5 py-3">
          <Pause aria-hidden className="shrink-0 text-fg-muted" size={15} weight="regular" />
          <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted">
            {t("pausedDuringImportCount", { count: migrationHold.keywordCount })}
          </p>
          <Link className={actionClassName} href={timelineHref}>
            {t("review")}
          </Link>
        </div>
      ) : null}

      {budgetExhausted ? (
        <div className="flex items-center gap-2.5 rounded-card border border-yellow/35 bg-yellow/10 px-3.5 py-3">
          <Gauge aria-hidden className="shrink-0 text-yellow-text" size={16} weight="regular" />
          <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted">
            {t("monthlyBudgetReachedCount", { count: budgetExhausted.keywordCount })}
          </p>
          <Link className={actionClassName} href={providerSettingsHref}>
            {t("reviewBudget")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
