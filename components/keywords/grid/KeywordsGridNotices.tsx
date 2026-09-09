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
import type { ReactNode } from "react";
import type { CheckHealthView } from "./KeywordGridHealthNotices";

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

function emptyRankNotice({
  checkStates,
  failedCount,
  providerConnected,
  projectRef,
  readOnly,
}: {
  checkStates: KeywordCheckState[];
  failedCount: number;
  providerConnected?: boolean;
  projectRef: string;
  readOnly: boolean;
}): EmptyRankNotice | null {
  if (readOnly) {
    return {
      detail: "Rank checks cannot start until the migration hold is released.",
      kind: "alert",
      tint: "yellow",
      title: "Rank checks paused - migration hold.",
    };
  }
  if (failedCount > 0 || checkStates.includes("failed")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        label: "Review check runs",
      },
      detail: "Some keyword positions could not be updated.",
      kind: "alert",
      tint: "red",
      title: "Rank checks failed to produce ranking data.",
    };
  }
  if (checkStates.includes("running")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        icon: "arrow",
        label: "View check runs",
      },
      detail: "Ranking data will appear after the running checks finish.",
      kind: "alert",
      tint: "yellow",
      title: "Rank checks are running.",
    };
  }
  if (checkStates.some((state) => state === "not_ranked")) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        icon: "arrow",
        label: "View check runs",
      },
      detail: "Completed checks did not find these domains in the top 100 results.",
      kind: "alert",
      tint: "yellow",
      title: "No top-100 rankings found.",
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
  const { readOnly } = useProjectWriteMode();
  const rankNotice = emptyRankNotice({
    checkStates,
    failedCount: checkHealth?.failed24h.count ?? 0,
    providerConnected,
    projectRef: projectId,
    readOnly,
  });
  return (
    <>
      {rankNotice?.kind === "first-check" ? (
        <FirstCheckBanner
          action={
            rankNotice.connectProvider && canManageProviders ? (
              <FirstCheckBannerLink
                href={appPath(projectId, "integrations")}
                label="Connect provider"
              />
            ) : firstPendingKeywordId && runCheckNowAction ? (
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
