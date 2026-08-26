"use client";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { KeywordsGridNotices } from "./KeywordsGridNotices";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Props = Pick<
  KeywordsGridProps,
  | "canManageProviders"
  | "canUpdateKeyword"
  | "checkHealth"
  | "getFirstCheckRunPlanAction"
  | "providerConnected"
  | "projectId"
  | "queueFirstChecksAction"
  | "rows"
  | "runCheckNowAction"
  | "totalKeywordCount"
> & { emptyRankCheckStates: KeywordCheckState[]; flatServer: boolean };
export function KeywordsGridNoticeBlock(props: Props) {
  const firstPendingKeywordId = props.flatServer
    ? null
    : (props.rows.find((row) => row.checkState === "never_checked")?.id ?? null);
  return (
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
  );
}
