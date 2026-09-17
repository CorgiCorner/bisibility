"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";

export type KeywordNoRowsState = {
  description: string;
  onResetScope?: () => void;
  title: string;
};

export function KeywordNoRowsOverlay({ state }: Readonly<{ state?: KeywordNoRowsState }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const title = state?.title ?? t("noRowsTitle");
  const description = state?.description ?? t("noRowsDescription");
  const onResetScope = state?.onResetScope;
  const action = onResetScope ? (
    <Button onClick={onResetScope} size="sm" type="button" variant="secondary">
      {t("showAllScope")}
    </Button>
  ) : undefined;

  return (
    <div className="p-4">
      <EmptyState
        action={action}
        description={description}
        icon={<MagnifyingGlass weight="regular" size={22} />}
        title={title}
      />
    </div>
  );
}
