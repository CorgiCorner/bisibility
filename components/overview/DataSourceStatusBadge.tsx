"use client";

import { useTranslations } from "next-intl";
import { dataSourceStatusColor, dataSourceStatusTextColor } from "./data-source-status";
import type { DataSourceHealth } from "./types";

export function DataSourceStatusBadge({
  status,
}: Readonly<{ status: DataSourceHealth["status"] }>) {
  const t = useTranslations("projectDashboard.dataSource");
  const color = dataSourceStatusColor(status);
  const label =
    status === "healthy"
      ? t("providerHealthy")
      : status === "needsAttention"
        ? t("providerNeedsAttention")
        : status === "notConnected"
          ? t("providerNotConnected")
          : status === "migrationHold"
            ? t("migrationHold")
            : t("providerFailed");

  return (
    <span
      className="inline-flex flex-none items-center gap-1 p-0 font-sans tabular-nums text-[10px] font-semibold leading-4"
      style={{ color: dataSourceStatusTextColor(status) }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
