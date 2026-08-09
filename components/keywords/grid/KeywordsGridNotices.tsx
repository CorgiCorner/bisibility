import { keywordCountLabel } from "@/components/keywords/action-utils";
import { FirstCheckBanner, FirstCheckBannerLink } from "@/components/rank-check/FirstCheckBanner";
import {
  FirstCheckBannerAction,
  type GetFirstCheckRunPlanAction,
  type QueueFirstChecksAction,
  type RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { AlertBanner } from "@/components/ui";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
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
  totalKeywordCount?: number;
};

type EmptyRankNotice =
  | {
      connectProvider: boolean;
      kind: "first-check";
    }
  | {
      action?: { href: string; icon: "arrow"; label: string };
      detail: ReactNode;
      kind: "alert";
      tint: "red" | "yellow";
      title: string;
    };

function emptyRankNotice({
  budgetExhausted,
  checkStates,
  failedCount,
  providerConnected,
  projectRef,
  readOnly,
}: {
  budgetExhausted: boolean;
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
  if (budgetExhausted) {
    return {
      action: { href: appPath(projectRef, "checks"), icon: "arrow", label: "View check runs" },
      detail: (
        <>
          No new rank checks can start until the monthly budget resets or is increased.{" "}
          <Link
            className="font-semibold text-accent-text hover:underline"
            href={`${appPath(projectRef, "settings")}#provider-usage`}
          >
            Raise the budget
          </Link>
        </>
      ),
      kind: "alert",
      tint: "yellow",
      title: "Rank checks paused - monthly budget reached.",
    };
  }
  if (failedCount > 0 || checkStates.includes("failed")) {
    return {
      action: { href: appPath(projectRef, "checks"), icon: "arrow", label: "Review check runs" },
      detail: "At least one latest rank check failed before producing a position.",
      kind: "alert",
      tint: "red",
      title: "Rank checks failed to produce ranking data.",
    };
  }
  if (checkStates.includes("running")) {
    return {
      action: { href: appPath(projectRef, "checks"), icon: "arrow", label: "View check runs" },
      detail: "Ranking data will appear after the running checks finish.",
      kind: "alert",
      tint: "yellow",
      title: "Rank checks are running.",
    };
  }
  if (checkStates.some((state) => state === "not_ranked")) {
    return {
      action: { href: appPath(projectRef, "checks"), icon: "arrow", label: "View check runs" },
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
  totalKeywordCount,
}: Readonly<KeywordsGridNoticesProps>) {
  const { readOnly } = useProjectWriteMode();
  const rankNotice = emptyRankNotice({
    budgetExhausted: checkHealth?.budget.exhausted ?? false,
    checkStates,
    failedCount: checkHealth?.failed24h.count ?? 0,
    providerConnected,
    projectRef: projectId,
    readOnly,
  });
  const truncationNotice =
    totalKeywordCount !== undefined && totalKeywordCount > rowCount ? (
      <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
        <AlertBanner
          detail={`This project tracks ${keywordCountLabel(totalKeywordCount)}. Search, filters, and export apply to the loaded set.`}
          tint="yellow"
          title={`Showing the ${rowCount.toLocaleString("en-US")} most recently added keywords`}
        />
      </div>
    ) : null;

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
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <AlertBanner
            action={rankNotice.action}
            detail={rankNotice.detail}
            tint={rankNotice.tint}
            title={rankNotice.title}
          />
        </div>
      ) : null}
      {truncationNotice}
    </>
  );
}
