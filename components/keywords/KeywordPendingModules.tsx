"use client";

import {
  Card,
  dangerIconWellClassName,
  iconWellClassName,
  iconWellSurfaceClassName,
  SectionTitle,
} from "@/components/ui";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import { cn } from "@/lib/ui/cn";
import {
  ClockCountdownIcon as ClockCountdown,
  RankingIcon as Ranking,
  SpinnerGapIcon as SpinnerGap,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/ssr";
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
      <SectionTitle>Position history</SectionTitle>
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
          <p className="m-0 mt-3 text-[15px] font-semibold leading-[1.35] text-fg">{copy.title}</p>
          <p className="m-0 mt-1.5 text-[12px] leading-[1.45] text-fg-muted">{copy.body}</p>
        </div>
      </div>
    </Card>
  );
}

export function KeywordPendingModules({ copy, state }: Readonly<KeywordPendingModulesProps>) {
  return <PendingChart copy={copy} state={state} />;
}
