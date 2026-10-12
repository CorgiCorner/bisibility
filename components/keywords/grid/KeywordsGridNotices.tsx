import {
  dismissRankRunNotice,
  isInRankRunNoticeDismissalSnapshot,
  type RankRunNoticeIdentity,
  rankRunNoticeDismissalStorageKey,
  useRankRunNoticeDismissalSnapshot,
} from "@/components/rank-runs/notice-dismissals";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { AlertBannerStack } from "@/components/ui/AlertBannerStack";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { CheckHealthView } from "./keywords-grid-types";

type KeywordsGridNoticesProps = {
  checkHealth?: CheckHealthView;
  checkStates: KeywordCheckState[];
  projectId: string;
};

type EmptyRankNotice = {
  action?: { href: string; icon?: "arrow"; label: string };
  detail: ReactNode;
  tint: "red" | "yellow";
  title: string;
};

type NoticesTranslations = ReturnType<typeof useTranslations<"projectRankTracker.list.notices">>;

function emptyRankNotice({
  checkStates,
  failedCount,
  projectRef,
  readOnly,
  t,
}: {
  checkStates: KeywordCheckState[];
  failedCount: number;
  projectRef: string;
  readOnly: boolean;
  t: NoticesTranslations;
}): EmptyRankNotice | null {
  if (readOnly) {
    return {
      detail: t("migrationHoldDetail"),
      tint: "yellow",
      title: t("migrationHoldTitle"),
    };
  }
  if (failedCount > 0) {
    return {
      action: {
        href: projectRunsPath(projectRef),
        label: t("reviewCheckRuns"),
      },
      detail: t("failedDetail"),
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
      tint: "yellow",
      title: t("notRankedTitle"),
    };
  }
  return null;
}

export function KeywordsGridNotices({
  checkHealth,
  checkStates,
  projectId,
}: Readonly<KeywordsGridNoticesProps>) {
  const t = useTranslations("projectRankTracker.list.notices");
  const { readOnly } = useProjectWriteMode();
  const failureIdentity: RankRunNoticeIdentity | null = checkHealth?.currentFailures?.latestCheckId
    ? {
        kind: "rank-tracker-failures",
        projectId,
        checkId: checkHealth.currentFailures.latestCheckId,
      }
    : null;
  const dismissed = useRankRunNoticeDismissalSnapshot(failureIdentity ? [failureIdentity] : []);
  const failureDismissed =
    failureIdentity !== null && isInRankRunNoticeDismissalSnapshot(dismissed, failureIdentity);
  const rankNotice = emptyRankNotice({
    checkStates,
    failedCount:
      checkHealth?.currentFailures?.count ??
      checkStates.filter((state) => state === "failed").length,
    projectRef: projectId,
    readOnly,
    t,
  });
  return (
    <>
      {rankNotice && !(rankNotice.tint === "red" && failureDismissed) ? (
        <AlertBannerStack>
          <AlertBanner
            key={
              failureIdentity ? rankRunNoticeDismissalStorageKey(failureIdentity) : rankNotice.title
            }
            onDismiss={
              rankNotice.tint === "red" && failureIdentity
                ? () => dismissRankRunNotice(failureIdentity)
                : undefined
            }
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
