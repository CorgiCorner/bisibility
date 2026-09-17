"use client";

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
      <div className="flex flex-col items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-control bg-bg-sunken text-fg-muted">
          <Icon aria-hidden data-icon={Icon.displayName} size={20} weight="regular" />
        </span>
        <span className="text-sm font-semibold text-fg">{title ?? t("noDataTitle")}</span>
        <span className="font-sans tabular-nums text-[11px] text-fg-muted">
          {description ?? t("noDataDescription")}
        </span>
      </div>
    </div>
  );
}
