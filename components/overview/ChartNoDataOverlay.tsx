"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import type { Icon } from "@phosphor-icons/react/lib";
import { useTranslations } from "next-intl";

type ChartNoDataOverlayProps = {
  description?: string;
  icon?: Icon;
  title?: string;
};

export function ChartNoDataOverlay({
  description,
  icon: Icon = ChartLineUp,
  title,
}: Readonly<ChartNoDataOverlayProps>) {
  const t = useTranslations("projectDashboard.positionTrend");
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
      <EmptyState
        compact
        icon={<Icon aria-hidden data-icon={Icon.displayName} size={20} weight="regular" />}
        title={title ?? t("noDataTitle")}
        description={description ?? t("noDataDescription")}
      />
    </div>
  );
}
