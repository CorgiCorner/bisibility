import { Sparkline } from "@/components/charts/Sparkline";
import {
  chronologicalTrend,
  difficultyPillStyle,
  IntentChip,
} from "@/components/research/research-results-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { RelativePastFact } from "@/lib/format/relative-time";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { cn } from "@/lib/ui/cn";
import { ClockIcon as Clock } from "@phosphor-icons/react/dist/csr/Clock";
import Link from "next/link";
import { SavedKeywordRowMenu } from "./SavedKeywordRowMenu";
import {
  savedKeywordAge,
  savedKeywordIsStale,
  savedKeywordResearchHref,
} from "./saved-keywords-table-model";

export type SavedKeywordsTableRow = SavedKeywordRow & { id: string; keyword: string };

type SavedKeywordsTableColumnsOptions = {
  canDelete: boolean;
  canTrack: boolean;
  formatCurrency: (value: number) => string;
  formatVolume: (value: number) => string;
  labels: {
    actions: string;
    cpc: string;
    difficulty: string;
    intent: string;
    intentLabel: (intent: SavedKeywordRow["intent"]) => string;
    keyword: string;
    researchFallback: string;
    relativePast: (fact: RelativePastFact) => string;
    saved: string;
    snapshotStale: string;
    source: string;
    sourceAria: (values: { location: string; source: string }) => string;
    trend: string;
    variants: (values: { count: number }) => string;
    volume: string;
    volumeTrend: (values: { keyword: string }) => string;
  };
  onRemove: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
};

function SavedAt({
  relativePast,
  savedAt,
  snapshotStale,
}: Readonly<{
  relativePast: (fact: RelativePastFact) => string;
  savedAt: string;
  snapshotStale: string;
}>) {
  const stale = savedKeywordIsStale(savedAt);
  return (
    <span
      aria-label={stale ? snapshotStale : undefined}
      className={cn(
        "inline-flex items-center gap-1 font-sans tabular-nums text-[12px]",
        stale ? "text-yellow-text" : "text-fg-muted",
      )}
    >
      {stale ? <Clock size={12} weight="regular" /> : null}
      {relativePast(savedKeywordAge(savedAt))}
    </span>
  );
}

function KeywordCell({
  row,
  variants,
}: Readonly<{
  row: SavedKeywordsTableRow;
  variants: (values: { count: number }) => string;
}>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-[13.5px] font-medium text-fg">{row.text}</span>
      {row.variantCount > 0 ? (
        <span className="whitespace-nowrap text-[11px] text-fg-muted">
          {variants({ count: row.variantCount })}
        </span>
      ) : null}
    </span>
  );
}

export function savedKeywordsTableColumns({
  canDelete,
  canTrack,
  formatCurrency,
  formatVolume,
  labels,
  onRemove,
  onTrack,
  projectRef,
}: Readonly<SavedKeywordsTableColumnsOptions>): readonly DataTableColumn<SavedKeywordsTableRow>[] {
  return [
    {
      accessorKey: "keyword",
      cell: ({ row }) => <KeywordCell row={row.original} variants={labels.variants} />,
      header: labels.keyword,
      id: "keyword",
      meta: { flex: 1.4, lockVisible: true, pin: "left", sortable: false, title: labels.keyword },
      minSize: 200,
      size: 224,
    },
    {
      accessorKey: "volume",
      cell: ({ row }) => (row.original.volume == null ? "-" : formatVolume(row.original.volume)),
      header: () => <span className="font-semibold text-accent-text">{labels.volume} ↓</span>,
      id: "volume",
      meta: { align: "end", sortable: false, title: labels.volume },
      minSize: 88,
      size: 88,
    },
    {
      cell: ({ row }) => (
        <Sparkline
          ariaLabel={labels.volumeTrend({ keyword: row.original.text })}
          data={chronologicalTrend(row.original.trend).map((point) => point.searchVolume)}
        />
      ),
      header: labels.trend,
      id: "trend",
      meta: { sortable: false, title: labels.trend },
      minSize: 92,
      size: 92,
    },
    {
      accessorKey: "difficulty",
      cell: ({ row }) => (
        <span
          className="inline-grid h-6 min-w-6 place-items-center rounded-full border px-1 font-sans tabular-nums text-[10.5px] font-semibold"
          style={difficultyPillStyle(row.original.difficulty)}
        >
          {row.original.difficulty ?? "-"}
        </span>
      ),
      header: labels.difficulty,
      id: "difficulty",
      meta: { sortable: false, title: labels.difficulty },
      minSize: 64,
      size: 64,
    },
    {
      accessorKey: "cpc",
      cell: ({ row }) => (row.original.cpc == null ? "-" : formatCurrency(row.original.cpc)),
      header: labels.cpc,
      id: "cpc",
      meta: { align: "end", sortable: false, title: labels.cpc },
      minSize: 80,
      size: 80,
    },
    {
      accessorKey: "intent",
      cell: ({ row }) => (
        <IntentChip intent={row.original.intent} label={labels.intentLabel(row.original.intent)} />
      ),
      header: labels.intent,
      id: "intent",
      meta: { sortable: false, title: labels.intent },
      minSize: 84,
      size: 84,
    },
    {
      accessorKey: "sourceSeed",
      cell: ({ row }) => (
        <Link
          aria-label={labels.sourceAria({
            location: row.original.location,
            source: row.original.sourceSeed ?? labels.researchFallback,
          })}
          className="inline-block max-w-full truncate rounded bg-bg-sunken px-1.5 py-0.5 font-sans tabular-nums text-[10px] text-fg-muted hover:text-accent-text"
          href={savedKeywordResearchHref(projectRef, row.original)}
          onClick={(event) => event.stopPropagation()}
        >
          {row.original.sourceSeed ?? labels.researchFallback} / {row.original.location}
        </Link>
      ),
      header: labels.source,
      id: "source",
      meta: { sortable: false, title: labels.source },
      minSize: 160,
      size: 160,
    },
    {
      accessorKey: "savedAt",
      cell: ({ row }) => (
        <SavedAt
          relativePast={labels.relativePast}
          savedAt={row.original.savedAt}
          snapshotStale={labels.snapshotStale}
        />
      ),
      header: labels.saved,
      id: "savedAt",
      meta: { sortable: false, title: labels.saved },
      minSize: 104,
      size: 104,
    },
    {
      cell: ({ row }) => (
        <SavedKeywordRowMenu
          canDelete={canDelete}
          canTrack={canTrack}
          onRemove={onRemove}
          onTrack={onTrack}
          projectRef={projectRef}
          row={row.original}
        />
      ),
      enableSorting: false,
      header: "",
      id: "actions",
      maxSize: 52,
      meta: {
        align: "end",
        lockResize: true,
        lockVisible: true,
        pin: "right",
        sortable: false,
        title: labels.actions,
      },
      minSize: 52,
      size: 52,
    },
  ];
}
