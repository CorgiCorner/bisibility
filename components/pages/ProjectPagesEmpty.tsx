"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProjectPageColumnSource } from "@/lib/pages/types";
import { useTranslations } from "next-intl";

export function ProjectPagesEmpty({
  canWrite,
  onRefresh,
  pending,
  sources,
}: Readonly<{
  canWrite: boolean;
  onRefresh: () => void;
  pending: boolean;
  sources: readonly ProjectPageColumnSource[];
}>) {
  const t = useTranslations("projectPages");
  return (
    <EmptyState
      action={
        canWrite ? (
          <Button loading={pending} onClick={onRefresh} size="sm" type="button" variant="secondary">
            {pending ? t("sourcesLine.refreshing") : t("sourcesLine.refresh")}
          </Button>
        ) : null
      }
      bullets={sources.map((source) => t(`sourceKind.${source.kind}`))}
      description={t("empty.description")}
      title={t("empty.title")}
    />
  );
}
