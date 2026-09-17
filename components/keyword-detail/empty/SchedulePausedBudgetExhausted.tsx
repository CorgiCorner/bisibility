import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { Button } from "@/components/ui/Button";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useTranslations } from "next-intl";

export type SchedulePausedBudgetExhaustedProps = {
  pauseReason?: string;
};

export function SchedulePausedBudgetExhausted({
  pauseReason,
}: Readonly<SchedulePausedBudgetExhaustedProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  const reason = pauseReason ?? t("pausedMigration");
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-bg-elev px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
          <EmptyModuleLabel>{t("nextCheckLabel")}</EmptyModuleLabel>
          <span className="text-[13px] font-semibold text-fg">{t("paused")}</span>
          <span aria-hidden className="h-3 border-l border-border" />
          <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">{reason}</span>
        </div>
        <Button disabled size="sm" type="button" variant="secondary">
          {t("runCheck")}
        </Button>
      </div>
      <div
        aria-label={t("budgetAria")}
        className="mt-3 flex items-start gap-3 rounded-control border border-border bg-bg-elev px-4 py-3"
        data-persistent-inline-banner
        role="alert"
      >
        <WarningCircle
          aria-hidden
          className="mt-0.5 shrink-0 text-red-text"
          size={16}
          weight="regular"
        />
        <div>
          <p className="m-0 text-[13px] font-semibold text-fg">{t("budgetTitle")}</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
            {t("budgetDescription")}
          </p>
        </div>
      </div>
    </EmptyModuleCard>
  );
}
