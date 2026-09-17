import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { useTranslations } from "next-intl";

export function KeywordContextAllUnknown() {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  return (
    <EmptyModuleCard>
      <EmptyModuleLabel>{t("keywordContext")}</EmptyModuleLabel>
      <p className="m-0 mt-3 text-[13px] leading-[1.5] text-fg-muted">{t("metricsUnavailable")}</p>
    </EmptyModuleCard>
  );
}
