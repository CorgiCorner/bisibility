"use client";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
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
  | "rows"
  | "runCheckNowAction"
  | "totalKeywordCount"
> & {
  emptyRankCheckStates: KeywordCheckState[];
  flatServer: boolean;
  marketScope: MarketScope | null;
};
export function KeywordsGridNoticeBlock(props: Props) {
  const firstPendingKeywordId = props.flatServer
    ? null
    : (props.rows.find((row) => row.checkState === "never_checked")?.id ?? null);
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
        checkStates={props.flatServer ? [] : props.emptyRankCheckStates}
        firstPendingKeywordId={firstPendingKeywordId}
        getFirstCheckRunPlanAction={props.getFirstCheckRunPlanAction}
        providerConnected={props.providerConnected}
        projectId={props.projectId}
        queueFirstChecksAction={props.queueFirstChecksAction}
        runCheckNowAction={props.canUpdateKeyword ? props.runCheckNowAction : undefined}
        rowCount={props.rows.length}
        totalKeywordCount={props.flatServer ? undefined : props.totalKeywordCount}
      />
    </>
  );
}
