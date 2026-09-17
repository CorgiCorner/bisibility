import { FirstCheckBanner, FirstCheckBannerLink } from "@/components/rank-check/FirstCheckBanner";
import {
  FirstCheckBannerAction,
  type GetFirstCheckRunPlanAction,
  type QueueFirstChecksAction,
  type RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { AlertBannerStack } from "@/components/ui/AlertBannerStack";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { CheckHealthView } from "./keywords-grid-types";

type KeywordsGridNoticesProps = {
  canManageProviders: boolean;
  checkHealth?: CheckHealthView;
  checkStates: KeywordCheckState[];
  firstPendingKeywordId?: string | null;
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  providerConnected?: boolean;
  projectId: string;
  queueFirstChecksAction: QueueFirstChecksAction;
  runCheckNowAction?: RunFirstCheckAction;
  rowCount: number;
};

type EmptyRankNotice =
  | {
      connectProvider: boolean;
      kind: "first-check";
    }
  | {
      action?: { href: string; icon?: "arrow"; label: string };
      detail: ReactNode;
      kind: "alert";
      tint: "red" | "yellow";
      title: string;
    };

type NoticesTranslations = ReturnType<typeof useTranslations<"projectRankTracker.list.notices">>;

function emptyRankNotice({
  checkStates,
  failedCount,
  providerConnected,
  projectRef,
  readOnly,
  t,
}: {
  checkStates: KeywordCheckState[];
  failedCount: number;
  providerConnected?: boolean;
  projectRef: string;
  readOnly: boolean;
  t: NoticesTranslations;
}): EmptyRankNotice | null {
  if (readOnly) {
    return {
      detail: t("migrationHoldDetail"),
      kind: "alert",
      tint: "yellow",
      title: t("migrationHoldTitle"),
    };
  }
  if (failedCount > 0 || checkStates.includes("failed")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        label: t("reviewCheckRuns"),
      },
      detail: t("failedDetail"),
      kind: "alert",
      tint: "red",
      title: t("failedTitle"),
    };
  }
  if (checkStates.includes("running")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        icon: "arrow",
        label: t("viewCheckRuns"),
      },
      detail: t("runningDetail"),
      kind: "alert",
      tint: "yellow",
      title: t("runningTitle"),
    };
  }
  if (checkStates.some((state) => state === "not_ranked")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        icon: "arrow",
        label: t("viewCheckRuns"),
      },
      detail: t("notRankedDetail"),
      kind: "alert",
      tint: "yellow",
      title: t("notRankedTitle"),
    };
  }
  if (checkStates.length > 0 && checkStates.every((state) => state === "never_checked")) {
    return {
      connectProvider: providerConnected === false,
      kind: "first-check",
    };
  }
  return null;
}

export function KeywordsGridNotices({
  canManageProviders,
  checkHealth,
  checkStates,
  firstPendingKeywordId,
  getFirstCheckRunPlanAction,
  providerConnected,
  projectId,
  queueFirstChecksAction,
  runCheckNowAction,
  rowCount,
}: Readonly<KeywordsGridNoticesProps>) {
  const t = useTranslations("projectRankTracker.list.notices");
  const { readOnly } = useProjectWriteMode();
  const rankNotice = emptyRankNotice({
    checkStates,
    failedCount: checkHealth?.failed24h.count ?? 0,
    providerConnected,
    projectRef: projectId,
    readOnly,
    t,
  });
  return (
    <>
      {rankNotice?.kind === "first-check" ? (
        <FirstCheckBanner
          action={
            rankNotice.connectProvider && canManageProviders ? (
              <FirstCheckBannerLink
                href={appPath(projectId, "integrations")}
                label={t("connectProvider")}
              />
            ) : rankNotice.connectProvider ? undefined : firstPendingKeywordId &&
              runCheckNowAction ? (
              <FirstCheckBannerAction
                getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
                keywordId={firstPendingKeywordId}
                projectId={projectId}
                queueFirstChecksAction={queueFirstChecksAction}
                runCheckNowAction={runCheckNowAction}
              />
            ) : undefined
          }
          keywordCount={rowCount}
        />
      ) : null}
      {rankNotice?.kind === "alert" ? (
        <AlertBannerStack>
          <AlertBanner
            action={rankNotice.action}
            detail={rankNotice.detail}
            tint={rankNotice.tint}
            title={rankNotice.title}
          />
        </AlertBannerStack>
      ) : null}
    </>
  );
}
