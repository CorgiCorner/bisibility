"use client";

import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { emptyRankCopy } from "./KeywordPendingEmptyState";
import { KeywordPendingModules } from "./KeywordPendingModules";
import { exportHistoryCsv } from "./keyword-history-export";
import { useKeywordScheduleModal } from "./use-keyword-schedule-modal";
import { type RankCheckPollAction, useRankCheckPoll } from "./use-rank-check-poll";

type KeywordPendingDetailProps = KeywordDetailActions & {
  canUpdateKeyword: boolean;
  history?: ReactNode;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  quality?: KeywordDetailQuality;
  scheduleTargets?: readonly KeywordRow[];
  pollAction?: RankCheckPollAction;
  providerConnected: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  projectRef: string;
  providerLabel?: string;
  rankState?: Exclude<KeywordDetailRankState, "normal">;
  searchConsoleConnected?: boolean;
};

export function KeywordPendingDetail({
  canUpdateKeyword,
  costContext,
  keyword,
  quality,
  scheduleTargets,
  history,
  pollAction,
  providerConnected,
  projectId,
  projectMarkets,
  projectRef,
  providerLabel,
  rankState,
  searchConsoleConnected = false,
  updateKeywordAction,
}: Readonly<KeywordPendingDetailProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.actions");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  useRankCheckPoll({
    rankCheckId: activeRun,
    pollAction,
    onTerminal: () => {
      setActiveRun(null);
      router.refresh();
    },
  });
  const preflight = useRunPreflight({
    projectId,
    providerId: costContext?.providerId,
    onStarted: (run) => setActiveRun(run.publicId),
  });
  const checkState =
    keyword.checkState ??
    (keyword.hasRankData
      ? "ranked"
      : keyword.lastCheckStatus === "failed" || keyword.lastCheckStatus === "running"
        ? keyword.lastCheckStatus
        : keyword.lastCheckStatus === "completed"
          ? "not_ranked"
          : "never_checked");
  const state = rankState ?? (checkState === "ranked" ? "not_ranked" : checkState);
  const defaultDepth = resolveSerpDepth(keyword.projectSerpDepth);
  const copy = emptyRankCopy(
    state,
    projectRef,
    keyword.trackedDepth ?? defaultDepth,
    providerConnected,
  );
  const canRunCheck = providerConnected;
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;
  const { onChangeSchedule, scheduleModal } = useKeywordScheduleModal({
    keyword,
    projectId,
    providerRate,
  });
  const sharedActions = {
    canUpdateKeyword,
    editing,
    effectiveDepth: defaultDepth,
    onExport: () => exportHistoryCsv(keyword),
    onRunCheck: (depth: SerpDepth) =>
      void preflight.request({
        depth,
        rows: [keyword],
        spec: { kind: "single", keywordId: keyword.id as `kw_${string}`, v: 1 },
      }),
    onToggleEdit: () => setEditing((value) => !value),
    providerRate,
    runPending: preflight.opening,
    runActive: activeRun !== null,
  };
  const actions = canRunCheck ? (
    <KeywordHeaderActions {...sharedActions} />
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <AccentCtaLink href={copy.href}>{t("connectProvider")}</AccentCtaLink>
      <KeywordHeaderActions {...sharedActions} showCheck={false} />
    </div>
  );

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={actions}
        scheduleTargets={scheduleTargets}
        projectRef={projectId}
        keyword={keyword}
        quality={quality}
        onChangeSchedule={canUpdateKeyword ? onChangeSchedule : undefined}
        providerLabel={providerLabel ?? costContext?.providerId ?? keyword.dataProvider}
        rankState={state}
        searchConsoleConnected={searchConsoleConnected}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      {canUpdateKeyword ? (
        <KeywordEditDrawer
          key={keyword.id}
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          projectMarkets={projectMarkets}
          providerRate={providerRate}
          updateKeywordAction={updateKeywordAction}
        />
      ) : null}
      {history ?? <KeywordPendingModules copy={copy} state={state} />}
      {scheduleModal}
      {preflight.dialog}
    </>
  );
}
