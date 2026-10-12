"use client";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { KeywordsGridNotices } from "./KeywordsGridNotices";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { MarketRunSliceStatus } from "./MarketRunSliceStatus";

type Props = Pick<KeywordsGridProps, "deepLinkRunId" | "checkHealth" | "projectId"> & {
  emptyRankCheckStates: KeywordCheckState[];
  marketScope?: MarketScope | null;
};
export function KeywordsGridNoticeBlock(props: Props) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  if (props.marketScope?.status === "paused")
    return (
      <AlertBanner
        tint="yellow"
        title={t("marketPausedTitle")}
        detail={t("marketPausedDetail")}
        action={{ href: appPath(props.projectId, "markets"), label: t("manageMarkets") }}
      />
    );
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
        checkHealth={props.checkHealth}
        checkStates={props.emptyRankCheckStates}
        projectId={props.projectId}
      />
    </>
  );
}
