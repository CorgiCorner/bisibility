import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { KeywordColumnLabels } from "./grid-columns";
import {
  ResearchCpcCell,
  ResearchDateCell,
  ResearchDifficultyCell,
  ResearchIntentCell,
  ResearchSourceCell,
  ResearchTrendCell,
  ResearchVolumeCell,
} from "./ResearchMetricCells";

function researchMixed(row: KeywordRow) {
  const parent = marketGridParent(row);
  if (!parent?.aggregate.children.some((child) => child.research)) return false;
  return (
    new Set(
      parent.aggregate.children.map(
        (child) => `${child.location.gl.toLowerCase()}:${child.location.hl.toLowerCase()}`,
      ),
    ).size > 1
  );
}

export function researchColumns(
  labels: KeywordColumnLabels,
  projectRef: string,
): DataTableColumn<KeywordRow>[] {
  return [
    {
      accessorFn: (row) => row.research?.volume ?? null,
      cell: ({ row }) => (
        <ResearchVolumeCell research={row.original.research} mixed={researchMixed(row.original)} />
      ),
      header: labels.researchHeaders.volume,
      id: "researchVolume",
      meta: { align: "end", title: labels.researchVolume },
      minSize: 112,
      size: 112,
    },
    {
      cell: ({ row }) => (
        <ResearchTrendCell
          research={row.original.research}
          mixed={researchMixed(row.original)}
          keyword={row.original.keyword}
        />
      ),
      header: labels.researchHeaders.trend,
      id: "researchTrend",
      meta: { sortable: false, title: labels.researchTrend },
      minSize: 112,
      size: 112,
    },
    {
      accessorFn: (row) => row.research?.difficulty ?? null,
      cell: ({ row }) => (
        <ResearchDifficultyCell
          research={row.original.research}
          mixed={researchMixed(row.original)}
        />
      ),
      header: labels.researchHeaders.difficulty,
      id: "researchDifficulty",
      meta: { title: labels.researchDifficulty },
      minSize: 112,
      size: 112,
    },
    {
      accessorFn: (row) => row.research?.cpc ?? null,
      cell: ({ row }) => (
        <ResearchCpcCell research={row.original.research} mixed={researchMixed(row.original)} />
      ),
      header: labels.researchHeaders.cpc,
      id: "researchCpc",
      meta: { align: "end", title: labels.researchCpc },
      minSize: 112,
      size: 112,
    },
    {
      accessorFn: (row) => row.research?.intent ?? null,
      cell: ({ row }) => (
        <ResearchIntentCell research={row.original.research} mixed={researchMixed(row.original)} />
      ),
      header: labels.researchHeaders.intent,
      id: "researchIntent",
      meta: { title: labels.researchIntent },
      minSize: 160,
      size: 160,
    },
    {
      accessorFn: (row) => row.research?.sourceSeed ?? null,
      cell: ({ row }) => (
        <ResearchSourceCell
          research={row.original.research}
          mixed={researchMixed(row.original)}
          projectRef={projectRef}
          location={row.original.location.canonicalKey}
        />
      ),
      header: labels.researchHeaders.source,
      id: "researchSource",
      meta: { title: labels.researchSource },
      minSize: 160,
      size: 160,
    },
    {
      accessorFn: (row) => row.research?.fetchedAt ?? null,
      cell: ({ row }) => (
        <ResearchDateCell research={row.original.research} mixed={researchMixed(row.original)} />
      ),
      header: labels.researchHeaders.date,
      id: "researchAt",
      meta: { title: labels.researchAt },
      minSize: 128,
      size: 128,
    },
  ];
}
