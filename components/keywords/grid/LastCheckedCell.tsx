import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { CheckStatusChip } from "@/components/ui/CheckStatusChip";
import type { LastCheckStatus } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";

type LastCheckedCellProps = {
  lastCheckAt: string | null;
  now?: Date;
  status: LastCheckStatus;
};

const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

function parsedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeLabel(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("yesterday") : t("daysAgo", { count: days });
}

export function LastCheckedCell({
  lastCheckAt,
  now = new Date(),
  status,
}: Readonly<LastCheckedCellProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const { readOnly } = useProjectWriteMode();
  if (readOnly) return <CheckStatusChip kind="pending" label={t("pausedMigration")} />;
  if (status === "running") return <CheckStatusChip kind="running" label={t("running")} />;
  if (status === "failed") return <CheckStatusChip kind="failed" label={t("failed")} />;

  const date = parsedDate(lastCheckAt);
  if (!date) return <CheckStatusChip kind="pending" label={t("notChecked")} />;

  const label = relativeLabel(date, now, t);
  if (now.getTime() - date.getTime() > staleAfterMs) {
    return <CheckStatusChip kind="pending" label={label} />;
  }

  return <CheckStatusChip kind="completed" label={label} />;
}
