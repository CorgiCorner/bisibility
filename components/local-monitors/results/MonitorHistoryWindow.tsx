"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  LOCAL_HISTORY_DAYS,
  localHistoryPresetHref,
  localHistoryRange,
} from "@/lib/local-monitor-results/history-links";
import type { LocalMonitorRunHistory } from "@/lib/local-monitor-results/model";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
export function MonitorHistoryWindow({
  href,
  history,
}: {
  href: string;
  history: LocalMonitorRunHistory;
}) {
  const t = useTranslations("shared.localMonitors.results"),
    format = useFormatter(),
    router = useRouter(),
    range = localHistoryRange(history.window, history.asOf);
  return (
    <div className="space-y-2">
      <MenuSelect
        ariaLabel={t("historyWindow")}
        value={range}
        options={[
          { value: "all", label: t("allHistory") },
          ...LOCAL_HISTORY_DAYS.map((days) => ({
            value: String(days),
            label: t("historyDays", { days: format.number(days) }),
          })),
          ...(range === "custom"
            ? [{ value: "custom", label: t("customHistory"), disabled: true }]
            : []),
        ]}
        onChange={(value) => {
          const next = localHistoryPresetHref(href, history.asOf, value);
          if (next) router.push(next);
        }}
      />
      <p className="text-sm text-fg-muted">{t("historyWindowHelp")}</p>
      {history.window?.from ? (
        <p className="text-sm">
          {t("historyBounds", {
            from: format.dateTime(new Date(history.window.from), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
            to: format.dateTime(new Date(history.window.to), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
      ) : null}
      {history.eligibleTotal !== undefined ? (
        <p className="text-sm">{t("historyCount", { count: history.eligibleTotal })}</p>
      ) : null}
    </div>
  );
}
