"use client";

import { HistoryScope } from "@/components/keyword-detail-history/HistoryScope";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useTranslations } from "next-intl";

export function KeywordDetailScopeProof({ quality }: Readonly<{ quality: KeywordDetailQuality }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  return (
    <div data-testid="keyword-detail-definition-scope" className="grid min-w-0 gap-1">
      <span className="text-[10px] font-semibold text-fg-muted">{t("currentDefinition")}</span>
      <HistoryScope scope={quality.expectedScope} />
    </div>
  );
}
