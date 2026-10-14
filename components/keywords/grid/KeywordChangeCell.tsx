import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CircleIcon as Circle } from "@phosphor-icons/react/dist/csr/Circle";
import { useTranslations } from "next-intl";
import {
  keywordGroupReport,
  keywordRankEvent,
  keywordRankMovement,
  keywordRankQuality,
} from "./keyword-rank-quality-view";

function deltaFor(
  row: KeywordRow,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
) {
  const change = keywordRankMovement(row);
  if (change === null) return null;
  if (change > 0) {
    return {
      color: "var(--green-text)",
      icon: ArrowUp,
      count: change,
      title: t("changeUp", { count: change }),
    };
  }
  if (change < 0) {
    return {
      color: "var(--red)",
      icon: ArrowDown,
      count: Math.abs(change),
      title: t("changeDown", { count: Math.abs(change) }),
    };
  }
  return { color: "var(--fg-muted)", count: 0, icon: Circle, title: t("noChange") };
}

export function KeywordChangeCell({ row }: Readonly<{ row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const qualityT = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  const event = keywordRankEvent(row);
  const comparison = keywordGroupReport(row)?.comparison ?? keywordRankQuality(row)?.comparison;
  if (keywordRankMovement(row) === null) {
    if (event === "first")
      return (
        <span
          aria-label={t("firstObservation")}
          className="inline-flex h-auto shrink-0 self-center items-center whitespace-nowrap rounded-full border border-border bg-accent-soft px-2.5 py-1 font-sans tabular-nums text-[11px] font-semibold leading-none text-accent-text"
        >
          {t("new")}
        </span>
      );
    const label =
      event === "entered" || event === "exited" || event === "re_entered"
        ? qualityT(`events.${event}`)
        : qualityT(
            comparison === "not_requested" ? "comparisonNotRequested" : "comparisonUnavailable",
          );
    return (
      <Tooltip content={label}>
        <span aria-label={label} className="font-sans text-[10.5px] text-fg-muted">
          {event && event !== "unknown" ? label : "-"}
        </span>
      </Tooltip>
    );
  }

  const delta = deltaFor(row, t);
  if (!delta) return null;
  const Icon = delta.icon;
  return (
    <Tooltip content={delta.title}>
      <span
        aria-label={delta.title}
        className="inline-flex items-center gap-1 font-sans tabular-nums text-xs font-semibold"
        style={{ color: delta.color }}
      >
        <Icon size={delta.count === 0 ? 7 : 12} weight="regular" />
        {delta.count}
      </span>
    </Tooltip>
  );
}
