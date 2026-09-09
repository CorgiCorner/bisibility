import { Sparkline } from "@/components/charts/Sparkline";
import {
  chronologicalTrend,
  difficultyPillStyle,
  IntentChip,
} from "@/components/research/research-results-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
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
  onRemove: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
};

function SavedAt({ savedAt }: Readonly<{ savedAt: string }>) {
  const stale = savedKeywordIsStale(savedAt);
  return (
    <span
      aria-label={stale ? "Saved snapshot is getting stale" : undefined}
      className={cn(
        "inline-flex items-center gap-1 font-sans tabular-nums text-[12px]",
        stale ? "text-yellow-text" : "text-fg-muted",
      )}
    >
      {stale ? <Clock size={12} weight="regular" /> : null}
      {savedKeywordAge(savedAt)}
    </span>
  );
}

function KeywordCell({ row }: Readonly<{ row: SavedKeywordsTableRow }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-[13.5px] font-medium text-fg">{row.text}</span>
      {row.variantCount > 0 ? (
        <span className="whitespace-nowrap text-[11px] text-fg-muted">
          +{row.variantCount} variants
        </span>
      ) : null}
    </span>
  );
}

export function savedKeywordsTableColumns({
  canDelete,
  canTrack,
  onRemove,
  onTrack,
  projectRef,
}: Readonly<SavedKeywordsTableColumnsOptions>): readonly DataTableColumn<SavedKeywordsTableRow>[] {
  return [
    {
      accessorKey: "keyword",
      cell: ({ row }) => <KeywordCell row={row.original} />,
      header: "Keyword",
      id: "keyword",
      meta: { flex: 1.4, lockVisible: true, pin: "left", sortable: false, title: "Keyword" },
      minSize: 200,
      size: 224,
    },
    {
      accessorKey: "volume",
      cell: ({ row }) =>
        row.original.volume == null ? "-" : row.original.volume.toLocaleString("en-US"),
      header: () => <span className="font-semibold text-accent-text">Volume ↓</span>,
      id: "volume",
      meta: { align: "end", sortable: false, title: "Volume" },
      minSize: 88,
      size: 88,
    },
    {
      cell: ({ row }) => (
        <Sparkline
          ariaLabel={`Monthly volume trend for ${row.original.text}`}
          data={chronologicalTrend(row.original.trend).map((point) => point.searchVolume)}
        />
      ),
      header: "Trend",
      id: "trend",
      meta: { sortable: false, title: "Trend" },
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
      header: "KD",
      id: "difficulty",
      meta: { sortable: false, title: "KD" },
      minSize: 64,
      size: 64,
    },
    {
      accessorKey: "cpc",
      cell: ({ row }) =>
        row.original.cpc == null ? "-" : formatEstimateCents(row.original.cpc * 100),
      header: "CPC",
      id: "cpc",
      meta: { align: "end", sortable: false, title: "CPC" },
      minSize: 80,
      size: 80,
    },
    {
      accessorKey: "intent",
      cell: ({ row }) => <IntentChip intent={row.original.intent} />,
      header: "Intent",
      id: "intent",
      meta: { sortable: false, title: "Intent" },
      minSize: 84,
      size: 84,
    },
    {
      accessorKey: "sourceSeed",
      cell: ({ row }) => (
        <Link
          aria-label={`${row.original.sourceSeed ?? "Research"} / ${row.original.location}`}
          className="inline-block max-w-full truncate rounded bg-bg-sunken px-1.5 py-0.5 font-sans tabular-nums text-[10px] text-fg-muted hover:text-accent-text"
          href={savedKeywordResearchHref(projectRef, row.original)}
          onClick={(event) => event.stopPropagation()}
        >
          {row.original.sourceSeed ?? "Research"} / {row.original.location}
        </Link>
      ),
      header: "Source",
      id: "source",
      meta: { sortable: false, title: "Source" },
      minSize: 160,
      size: 160,
    },
    {
      accessorKey: "savedAt",
      cell: ({ row }) => <SavedAt savedAt={row.original.savedAt} />,
      header: "Saved",
      id: "savedAt",
      meta: { sortable: false, title: "Saved" },
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
        title: "Actions",
      },
      minSize: 52,
      size: 52,
    },
  ];
}
