"use client";

import { Badge } from "@/components/admin/AdminPrimitives";
import { healthToneForRate, type ProviderHealthRow } from "@/lib/ops/instance-admin-health";
import { useTranslations } from "next-intl";

type ProviderHealthTranslations = ReturnType<
  typeof useTranslations<"instanceAdmin.providerHealth">
>;

function ageLabel(ageMs: number | null, t: ProviderHealthTranslations): string {
  if (ageMs === null) return t("unknown");
  const hours = ageMs / 3_600_000;
  if (hours < 1) return t("ageMinutes", { count: Math.max(1, Math.round(ageMs / 60_000)) });
  if (hours < 48) return t("ageHours", { count: Math.round(hours) });
  return t("ageDays", { count: Math.round(hours / 24) });
}

function rateLabel(rate: number | null, t: ProviderHealthTranslations): string {
  return rate === null ? t("failureRateUnknown") : t("failureRate", { value: rate });
}

export function AdminProviderHealth({ rows }: Readonly<{ rows: readonly ProviderHealthRow[] }>) {
  const t = useTranslations("instanceAdmin.providerHealth");
  if (rows.length === 0) {
    return <p className="text-xs text-fg-muted">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const tone = healthToneForRate(row.failureRatePercent);
        return (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-border px-0.5 py-3 last:border-0"
            key={row.provider}
          >
            <span className="min-w-[4.75rem] shrink-0 text-xs font-bold text-fg">
              {row.provider}
            </span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge status="ok">{t("ok", { count: row.ok })}</Badge>
              <Badge status="stale">{t("stale", { count: row.stale })}</Badge>
              <Badge status="failed">{t("failed", { count: row.failed })}</Badge>
              <Badge status="unknown">{t("notRun", { count: row.notRun })}</Badge>
            </span>
            <span className="text-[11px] tabular-nums text-fg-muted">
              {t("p95LastSuccess", { age: ageLabel(row.p95AgeMs, t) })}
            </span>
            <span className="sm:ml-auto">
              <Badge status={tone}>{rateLabel(row.failureRatePercent, t)}</Badge>
            </span>
          </div>
        );
      })}
    </div>
  );
}
