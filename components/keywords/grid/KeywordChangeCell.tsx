import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";
import * as rankDepth from "@/lib/serp/rank-depth";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CircleIcon as Circle } from "@phosphor-icons/react/dist/csr/Circle";
import { useTranslations } from "next-intl";

function deltaFor(
  row: KeywordRow,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
) {
  if (row.positionBaseline === null) return null;
  const change = row.positionBaseline - row.position;
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
  if (!rankDepth.hasTrackedPosition(row)) return null;
  if (row.positionBaseline === null) {
    return (
      <span
        aria-label={t("firstObservation")}
        className="inline-flex h-auto shrink-0 self-center items-center whitespace-nowrap rounded-full border border-border bg-accent-soft px-2.5 py-1 font-sans tabular-nums text-[11px] font-semibold leading-none text-accent-text"
      >
        {t("new")}
      </span>
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
