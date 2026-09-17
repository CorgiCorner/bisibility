"use client";

import {
  type HealthTone,
  healthToneForRate,
  type ProviderHealthRow,
} from "@/lib/ops/instance-admin-health";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const pillToneClasses: Record<HealthTone, string> = {
  failed: "bg-red/10 text-red-text",
  ok: "bg-green/10 text-green-text",
  stale: "bg-yellow/10 text-yellow-text",
  unknown: "bg-bg-sunken text-fg-muted",
};

const barToneClasses: Record<HealthTone, string> = {
  failed: "bg-red",
  ok: "bg-green",
  stale: "bg-yellow",
  unknown: "bg-fg-muted",
};

type ProviderHealthTranslations = ReturnType<
  typeof useTranslations<"instanceAdmin.providerHealth">
>;

function CountPill({ children, tone }: Readonly<{ children: ReactNode; tone: HealthTone }>) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums ${pillToneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

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
        const barWidth = Math.min(100, Math.max(0, row.failureRatePercent ?? 0));
        return (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-border px-0.5 py-3 last:border-0"
            key={row.provider}
          >
            <span className="min-w-[4.75rem] shrink-0 text-xs font-bold text-fg">
              {row.provider}
            </span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <CountPill tone="ok">{t("ok", { count: row.ok })}</CountPill>
              <CountPill tone="stale">{t("stale", { count: row.stale })}</CountPill>
              <CountPill tone="failed">{t("failed", { count: row.failed })}</CountPill>
              <CountPill tone="unknown">{t("notRun", { count: row.notRun })}</CountPill>
            </span>
            <span className="text-[11px] tabular-nums text-fg-muted">
              {t("p95LastSuccess", { age: ageLabel(row.p95AgeMs, t) })}
            </span>
            <span className="ml-auto inline-flex min-w-[9.5rem] items-center gap-2">
              <span className="h-1.5 min-w-[4.5rem] flex-1 overflow-hidden rounded-full bg-bg-sunken">
                <span
                  className={`block h-full rounded-full ${barToneClasses[tone]}`}
                  data-tone={tone}
                  style={{ width: `${barWidth}%` }}
                />
              </span>
              <span
                className={`whitespace-nowrap text-[11px] font-bold tabular-nums ${pillToneClasses[tone]}`}
              >
                {rateLabel(row.failureRatePercent, t)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
