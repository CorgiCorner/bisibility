"use client";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { KeywordsGridNotices } from "./KeywordsGridNotices";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { MarketRunSliceStatus } from "./MarketRunSliceStatus";

type Props = Pick<
  KeywordsGridProps,
  | "canManageProviders"
  | "canUpdateKeyword"
  | "deepLinkRunId"
  | "checkHealth"
  | "getFirstCheckRunPlanAction"
  | "providerConnected"
  | "projectId"
  | "queueFirstChecksAction"
  | "runCheckNowAction"
> & {
  emptyRankCheckStates: KeywordCheckState[];
  marketScope?: MarketScope | null;
  rows: KeywordRow[];
};
export function KeywordsGridNoticeBlock(props: Props) {
  if (props.marketScope?.status === "paused")
    return (
      <AlertBanner
        tint="yellow"
        title="This market is paused"
        detail="You can add and edit keywords. New rank checks will not start until you resume this market."
        action={{ href: appPath(props.projectId, "markets"), label: "Manage markets" }}
      />
    );
  const firstPendingKeywordId =
    props.rows.find((row) => row.checkState === "never_checked")?.id ?? null;
  return (
    <>
      {props.marketScope && props.deepLinkRunId ? (
        <MarketRunSliceStatus
          marketLabel={props.marketScope.label}
          projectRef={props.projectId}
          runId={props.deepLinkRunId}
        />
      ) : null}
      <KeywordsGridNotices
        canManageProviders={props.canManageProviders}
        checkHealth={props.checkHealth}
        checkStates={props.emptyRankCheckStates}
        firstPendingKeywordId={firstPendingKeywordId}
        getFirstCheckRunPlanAction={props.getFirstCheckRunPlanAction}
        providerConnected={props.providerConnected}
        projectId={props.projectId}
        queueFirstChecksAction={props.queueFirstChecksAction}
        runCheckNowAction={props.canUpdateKeyword ? props.runCheckNowAction : undefined}
        rowCount={props.rows.length}
      />
    </>
  );
}
