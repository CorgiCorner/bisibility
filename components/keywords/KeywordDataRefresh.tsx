"use client";

import { Button } from "@/components/ui/Button";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

export function KeywordDataRefresh() {
  const t = useTranslations("projectRankTracker.keywordDetail.actions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      loading={pending}
      loadingLabel={t("refreshingData")}
      onClick={() => startTransition(() => router.refresh())}
      startIcon={<ArrowClockwise aria-hidden size={15} weight="regular" />}
      title={t("refreshDataHint")}
      variant="secondary"
    >
      {t("refreshData")}
    </Button>
  );
}
