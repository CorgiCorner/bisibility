"use client";

import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateTimeWithSeconds } from "@/lib/dates/format";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

type AdminTranslations = ReturnType<typeof useTranslations<"instanceAdmin">>;

export function displayTime(
  value: string | null,
  context: DateDisplayContext,
  unavailable: string,
) {
  if (!value) return unavailable;
  return formatDisplayDateTimeWithSeconds(new Date(value), context);
}

export function duration(value: number | null, t: AdminTranslations) {
  if (value === null) return t("values.unavailable");
  if (value < 1_000) return t("duration.milliseconds", { value: Math.round(value) });
  if (value < 60_000) return t("duration.seconds", { value: value / 1_000 });
  return t("duration.minutes", { value: value / 60_000 });
}

function statusTone(status: string) {
  if (["ok", "completed", "succeeded_empty", "succeeded_with_data", "delivered"].includes(status)) {
    return "bg-green/10 text-green-text";
  }
  if (["stale", "deferred", "deferred_rate_limit", "warning"].includes(status)) {
    return "bg-yellow/10 text-yellow-text";
  }
  if (["failed", "error", "undelivered"].includes(status)) return "bg-red/10 text-red-text";
  return "bg-bg-sunken text-fg-muted";
}

export function statusLabel(status: string, t: AdminTranslations) {
  switch (status) {
    case "active":
      return t("status.active");
    case "blocked":
      return t("status.blocked");
    case "completed":
      return t("status.completed");
    case "deferred":
      return t("status.deferred");
    case "deferred_rate_limit":
      return t("status.deferredRateLimit");
    case "deactivated":
      return t("status.deactivated");
    case "delivered":
      return t("status.delivered");
    case "error":
      return t("status.error");
    case "failed":
      return t("status.failed");
    case "info":
      return t("status.info");
    case "ok":
      return t("status.ok");
    case "stale":
      return t("status.stale");
    case "succeeded_empty":
      return t("status.succeededEmpty");
    case "succeeded_with_data":
      return t("status.succeededWithData");
    case "undelivered":
      return t("status.undelivered");
    case "unknown":
      return t("status.unknown");
    case "warning":
      return t("status.warning");
    default:
      return status;
  }
}

export function Badge({ children, status }: Readonly<{ children?: ReactNode; status: string }>) {
  const t = useTranslations("instanceAdmin");
  return (
    <span
      className={cn(
        "inline-flex max-w-full rounded-full px-2 py-1 text-xs font-medium leading-4 [overflow-wrap:anywhere]",
        statusTone(status),
      )}
    >
      {children ?? statusLabel(status, t)}
    </span>
  );
}

export function Metric({
  label,
  value,
  technical = false,
}: Readonly<{ label: string; value: ReactNode; technical?: boolean }>) {
  const format = useFormatter();
  return (
    <div className="min-w-0 rounded-card border border-border bg-bg-sunken p-3">
      <div className="text-xs font-medium leading-5 text-fg-muted">{label}</div>
      <div
        className={cn(
          "mt-1 min-w-0 text-fg [overflow-wrap:anywhere]",
          technical
            ? "text-[13px] leading-5 tabular-nums"
            : "text-xl font-semibold leading-7 tabular-nums",
        )}
      >
        {typeof value === "number" ? format.number(value) : value}
      </div>
    </div>
  );
}

export function Panel({
  children,
  description,
  id,
  title,
}: Readonly<{ children: ReactNode; description: string; id: string; title: string }>) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <Card className="min-w-0" size="lg">
        <SectionTitle id={id}>{title}</SectionTitle>
        <p className="mt-1 max-w-4xl text-[13px] leading-relaxed text-fg-muted">{description}</p>
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  );
}

export function RankWindow({
  data,
  label,
}: Readonly<{ data: InstanceAdminDashboard["rank7d"]; label: string }>) {
  const t = useTranslations("instanceAdmin");
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg">{label}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label={t("rankWindow.scheduled")} value={data.scheduled} />
        <Metric label={t("rankWindow.succeeded")} value={data.succeeded} />
        <Metric label={t("rankWindow.failed")} value={data.failed} />
        <Metric label={t("rankWindow.deferred")} value={data.deferred} />
        <Metric label={t("rankWindow.stuck")} value={data.stuck} />
        <Metric label={t("rankWindow.lagP50")} value={duration(data.lagP50Ms, t)} />
        <Metric label={t("rankWindow.lagP95")} value={duration(data.lagP95Ms, t)} />
      </div>
    </div>
  );
}
