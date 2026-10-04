import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ValueBar } from "@/components/ui/ValueBar";
import type { DateFormat } from "@/lib/dates/format";
import type { DomainRankMetrics } from "@/lib/providers/types";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { MinusCircleIcon as MinusCircle } from "@phosphor-icons/react/dist/csr/MinusCircle";
import { PlusCircleIcon as PlusCircle } from "@phosphor-icons/react/dist/csr/PlusCircle";
import { useLocale, useTranslations } from "next-intl";
import styles from "./DomainOverviewWhatChanged.module.css";
import { sourceDateLabel } from "./domain-overview-metrics";

export function DomainOverviewWhatChanged({
  dateFormat,
  metrics,
  sourceSnapshotAt,
}: Readonly<{
  dateFormat: DateFormat;
  metrics: DomainRankMetrics;
  sourceSnapshotAt: string | null;
}>) {
  const locale = useLocale();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const number = new Intl.NumberFormat(locale);
  const max = Math.max(1, metrics.isNew, metrics.isLost, metrics.isUp, metrics.isDown);
  const rows = [
    {
      color: "green" as const,
      icon: PlusCircle,
      label: t("movementNew"),
      sign: "+",
      value: metrics.isNew,
    },
    {
      color: "red" as const,
      icon: MinusCircle,
      label: t("movementLost"),
      sign: "−",
      value: metrics.isLost,
    },
    {
      color: "green" as const,
      icon: ArrowUp,
      label: t("movementImproved"),
      sign: "",
      value: metrics.isUp,
    },
    {
      color: "red" as const,
      icon: ArrowDown,
      label: t("movementDeclined"),
      sign: "",
      value: metrics.isDown,
    },
  ];

  return (
    <Card className="flex min-w-0 flex-col px-4 py-4" size="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="m-0 text-[14.5px] font-semibold">{t("rankingChanges")}</h3>
          <InfoTooltip text={t("rankingChangesTooltip")} />
        </div>
        <span className="shrink-0 whitespace-nowrap font-sans tabular-nums text-[10px] uppercase tracking-[0.06em] text-fg-muted">
          {t("indexUpdated", { date: sourceDateLabel(sourceSnapshotAt, dateFormat, t) })}
        </span>
      </div>
      <ul aria-label={t("keywordMovements")} className={`${styles.grid} m-0 list-none p-0`}>
        {rows.map((row) => {
          const Icon = row.icon;
          const tone = row.color === "green" ? "text-green-text" : "text-red-text";
          return (
            <li className={styles.item} key={row.label}>
              <div className={styles.metric}>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
                  <Icon aria-hidden className={tone} size={13} weight="regular" />
                  {row.label}
                </span>
                <strong className={`${tone} font-sans tabular-nums text-[13px]`}>
                  {row.value > 0 ? row.sign : ""}
                  {number.format(row.value)}
                </strong>
              </div>
              <ValueBar
                className="mt-2 hidden xl:block"
                max={max}
                tone={row.color === "green" ? "positive" : "negative"}
                value={row.value}
              />
            </li>
          );
        })}
      </ul>
      <p className="mb-0 mt-auto hidden pt-3 text-[12px] leading-5 text-fg-muted xl:block">
        {t("rankingChangesNote")}
      </p>
    </Card>
  );
}
