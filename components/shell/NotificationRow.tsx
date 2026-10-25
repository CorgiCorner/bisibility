"use client";
import { parseLocale } from "@/i18n/config";
import { evidenceRunsPath } from "@/lib/checks/evidence-runs-query";
import { summaryRunsHref } from "@/lib/notifications/check-summaries/details-model";
import { formatCheckWindowLabel } from "@/lib/notifications/check-summaries/window-label";
import type { NotificationFeedItem } from "@/lib/queries/notifications";
import { cn } from "@/lib/ui/cn";
import { BellIcon as Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { FlagCheckeredIcon as FlagCheckered } from "@phosphor-icons/react/dist/csr/FlagCheckered";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import type { Icon } from "@phosphor-icons/react/lib";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useViewerTimeZone } from "./use-viewer-time-zone";

type NotificationKind = "check" | "error" | "rank" | "system" | "team";

const tintForKind: Record<NotificationKind, { bg: string; fg: string }> = {
  check: {
    bg: "color-mix(in srgb, var(--green) 13%, transparent)",
    fg: "var(--green)",
  },
  error: {
    bg: "color-mix(in srgb, var(--red) 13%, transparent)",
    fg: "var(--red)",
  },
  rank: {
    bg: "color-mix(in srgb, var(--blue) 13%, transparent)",
    fg: "var(--blue)",
  },
  system: {
    bg: "color-mix(in srgb, var(--blue) 13%, transparent)",
    fg: "var(--blue)",
  },
  team: {
    bg: "color-mix(in srgb, var(--purple) 13%, transparent)",
    fg: "var(--purple)",
  },
};

const iconForType: Record<NotificationFeedItem["type"], Icon> = {
  alert_fired: WarningCircle,
  check_complete: FlagCheckered,
  check_failed: WarningCircle,
  import_done: FlagCheckered,
  import_failed: WarningCircle,
  invite: UsersThree,
  manual_run_summary: FlagCheckered,
  member_joined: UsersThree,
  provider_incident: WarningCircle,
  scheduled_window_summary: FlagCheckered,
  system: Bell,
};

const kindForType: Record<NotificationFeedItem["type"], NotificationKind> = {
  alert_fired: "error",
  check_complete: "check",
  check_failed: "error",
  import_done: "check",
  import_failed: "error",
  invite: "team",
  manual_run_summary: "check",
  member_joined: "team",
  provider_incident: "error",
  scheduled_window_summary: "check",
  system: "system",
};

type NotificationRowProps = {
  item: NotificationFeedItem;
  onNavigate: () => void;
  unread: boolean;
  timeZone?: string;
};

export function NotificationRow({
  item,
  onNavigate,
  unread,
  timeZone: zone,
}: Readonly<NotificationRowProps>) {
  const Icon = iconForType[item.type] ?? ChartLineUp;
  const tint = tintForKind[kindForType[item.type] ?? "rank"];
  const t = useTranslations("shell.notifications");
  const locale = useLocale();
  const timeZone = useViewerTimeZone(zone);
  const data =
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? item.payload
      : {};
  const summary = item.type === "manual_run_summary" || item.type === "scheduled_window_summary";
  let title = item.title;
  let runsHref: string | null = null;
  const incidents = Array.isArray(data.linkedIncidentIds)
    ? data.linkedIncidentIds.filter((id): id is string => typeof id === "string")
    : [];
  if (summary && item.projectId) {
    title =
      item.type === "manual_run_summary"
        ? t("summary.manualTitle")
        : typeof data.windowStart === "string" && typeof data.windowEnd === "string"
          ? t("summary.clientScheduledTitle", {
              window: formatCheckWindowLabel({
                start: data.windowStart,
                end: data.windowEnd,
                timeZone,
                locale: parseLocale(locale) ?? "en",
              }),
              timeZone,
            })
          : item.title;
    const target = data.linkTarget;
    if (target && typeof target === "object" && !Array.isArray(target)) {
      if (typeof target.run === "string")
        runsHref = summaryRunsHref(item.projectId, { run: target.run });
      else if (typeof target.from === "string" && typeof target.to === "string")
        runsHref = summaryRunsHref(item.projectId, {
          from: target.from,
          to: target.to,
          trigger: "scheduled",
        });
    }
  }
  let detail = item.type === "check_failed" && item.body ? item.body : item.meta;

  if (summary) {
    const counts =
      data.counts && typeof data.counts === "object" && !Array.isArray(data.counts)
        ? data.counts
        : {};
    const parts = (["down", "up", "failed", "under_review", "unchanged", "new"] as const).flatMap(
      (key) => {
        const count = counts[key];
        return typeof count === "number" &&
          count > 0 &&
          !(key === "under_review" && incidents.length)
          ? [t(`summary.${key}`, { count })]
          : [];
      },
    );
    if (incidents.length) parts.push(t("summary.linkedIncidents", { count: incidents.length }));
    detail = new Intl.ListFormat(locale, { type: "unit" }).format(parts);
  }
  return (
    <div
      data-notification-id={item.id}
      data-version={item.version}
      className="border-b border-border last:border-b-0"
    >
      <Link
        className="flex w-full items-start gap-[11px] px-4 py-3 text-left transition-colors hover:bg-bg-sunken"
        href={
          summary && item.projectId ? `/app/${item.projectId}/runs/summaries/${item.id}` : item.href
        }
        onClick={onNavigate}
      >
        <span
          className="grid h-8 w-8 flex-none place-items-center rounded-control"
          style={{ background: tint.bg, color: tint.fg }}
        >
          <Icon aria-hidden size={16} weight="regular" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13px] font-medium leading-[1.35] text-fg",
              summary && "min-h-9 break-words",
            )}
            title={title}
          >
            {title}
          </span>
          <span
            className={cn(
              "mt-0.5 block font-sans text-[11px] text-fg-muted",
              summary && "min-h-8 break-words leading-4 tabular-nums",
            )}
          >
            {detail}
          </span>
        </span>
        <span className="flex flex-none flex-col items-end gap-[5px]">
          <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">{item.time}</span>
          <span
            className="h-[7px] w-[7px] rounded-full bg-accent"
            style={{ visibility: unread ? "visible" : "hidden" }}
          />
        </span>
      </Link>
      {summary ? (
        <div className="ml-11 flex min-h-7 flex-wrap gap-x-3 gap-y-1 px-4 pb-2 text-xs text-accent-text underline underline-offset-2">
          {runsHref ? (
            <Link href={runsHref} onClick={onNavigate}>
              {t("summary.viewRuns")}
            </Link>
          ) : null}
          {incidents.map((id) => (
            <Link
              key={id}
              href={`${evidenceRunsPath(item.projectId ?? "")}&incidentId=${encodeURIComponent(id)}`}
              onClick={onNavigate}
            >
              {t("summary.viewIncident")}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
