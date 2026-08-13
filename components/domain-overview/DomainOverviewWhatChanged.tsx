import { Card, InfoTooltip } from "@/components/ui";
import type { DomainRankMetrics } from "@/lib/providers/types";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  MinusCircleIcon as MinusCircle,
  PlusCircleIcon as PlusCircle,
} from "@phosphor-icons/react";
import styles from "./DomainOverviewWhatChanged.module.css";
import { sourceDateLabel } from "./domain-overview-metrics";

const number = new Intl.NumberFormat("en-US");

export function DomainOverviewWhatChanged({
  metrics,
  sourceSnapshotAt,
}: Readonly<{ metrics: DomainRankMetrics; sourceSnapshotAt: string | null }>) {
  const max = Math.max(1, metrics.isNew, metrics.isLost, metrics.isUp, metrics.isDown);
  const rows = [
    { color: "green" as const, icon: PlusCircle, label: "New", sign: "+", value: metrics.isNew },
    { color: "red" as const, icon: MinusCircle, label: "Lost", sign: "−", value: metrics.isLost },
    { color: "green" as const, icon: ArrowUp, label: "Improved", sign: "", value: metrics.isUp },
    { color: "red" as const, icon: ArrowDown, label: "Declined", sign: "", value: metrics.isDown },
  ];

  return (
    <Card className="flex min-w-0 flex-col px-4 py-4" size="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="m-0 text-[14.5px] font-semibold">Ranking changes</h3>
          <InfoTooltip text="Compared with DataForSEO's previous index check. The API does not provide that check's date. These are estimated indexed keywords, not your tracked rankings." />
        </div>
        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
          index updated {sourceDateLabel(sourceSnapshotAt)}
        </span>
      </div>
      <ul aria-label="Keyword movements" className={`${styles.grid} m-0 list-none p-0`}>
        {rows.map((row) => {
          const Icon = row.icon;
          const tone = row.color === "green" ? "text-green-text" : "text-red-text";
          return (
            <li className={styles.item} key={row.label}>
              <div className={styles.metric}>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
                  <Icon aria-hidden className={tone} size={13} weight="bold" />
                  {row.label}
                </span>
                <strong className={`${tone} font-mono text-[13px]`}>
                  {row.sign}
                  {number.format(row.value)}
                </strong>
              </div>
              <div
                aria-hidden
                className="mt-2 hidden h-1 overflow-hidden rounded-full border border-border-soft bg-bg-sunken xl:block"
              >
                <span
                  className={`block h-full rounded-full ${row.color === "green" ? "bg-green" : "bg-red"}`}
                  style={{ opacity: 0.55, width: `${Math.max(2, (row.value / max) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mb-0 mt-auto hidden pt-3 text-[12px] leading-5 text-fg-muted xl:block">
        Compared with DataForSEO's previous index check. Its date is not provided. Estimated indexed
        keywords, not your tracked rankings.
      </p>
    </Card>
  );
}
