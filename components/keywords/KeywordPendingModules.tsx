"use client";

import { Card } from "@/components/ui/Card";
import {
  dangerIconWellClassName,
  iconWellClassName,
  iconWellSurfaceClassName,
} from "@/components/ui/icon-well-styles";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import { cn } from "@/lib/ui/cn";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/ssr/ClockCountdown";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/ssr/Ranking";
import { SpinnerGapIcon as SpinnerGap } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useTranslations } from "next-intl";
import type { EmptyRankCopy } from "./KeywordPendingEmptyState";

type KeywordPendingModulesProps = {
  copy: EmptyRankCopy;
  state: Exclude<KeywordDetailRankState, "normal">;
};

function pendingChartWellClass(state: KeywordPendingModulesProps["state"]) {
  if (state === "failed") return dangerIconWellClassName;
  if (state === "not_ranked") return cn(iconWellSurfaceClassName, "text-yellow-text");
  if (state === "running") return cn(iconWellSurfaceClassName, "text-blue-text");
  return iconWellClassName;
}

function PendingChart({
  copy,
  state,
}: Readonly<{ copy: EmptyRankCopy; state: KeywordPendingModulesProps["state"] }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.pending");
  const running = state === "running";
  const Icon =
    state === "never_checked"
      ? ClockCountdown
      : state === "not_ranked"
        ? Ranking
        : state === "failed"
          ? WarningCircle
          : SpinnerGap;

  return (
    <Card radius="card" size="lg">
      <SectionTitle>{t("history")}</SectionTitle>
      <div className="mt-3 grid min-h-[176px] place-items-center rounded-card px-5 text-center">
        <div>
          <span
            className={cn(
              "mx-auto grid h-10 w-10 place-items-center rounded-control",
              pendingChartWellClass(state),
            )}
          >
            <Icon
              aria-hidden
              className={running ? "bv-spin" : undefined}
              size={20}
              weight="regular"
            />
          </span>
          <p className="m-0 mt-3 text-[15px] font-semibold leading-[1.35] text-fg">
            {state === "running"
              ? t("runningTitle")
              : state === "failed"
                ? t("failedTitle")
                : state === "not_ranked"
                  ? t("notRankedTitle", { depth: copy.depth })
                  : t("firstTitle")}
          </p>
          <p className="m-0 mt-1.5 text-[12px] leading-[1.45] text-fg-muted">
            {state === "running"
              ? t("runningBody")
              : state === "failed"
                ? t("failedBody")
                : state === "not_ranked"
                  ? t("notRankedBody")
                  : copy.action === "connect_provider"
                    ? t("firstBodyNoProvider")
                    : t("firstBody")}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function KeywordPendingModules({ copy, state }: Readonly<KeywordPendingModulesProps>) {
  return <PendingChart copy={copy} state={state} />;
}
