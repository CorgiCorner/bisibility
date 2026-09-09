"use client";

import { CompetitorDomainLink } from "@/components/competitors/CompetitorDomainLink";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { TagChip } from "@/components/ui/TagChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/dates/format";
import type { CompetitorSetSettingsModel } from "@/lib/queries/competitor-set-settings";
import { OverrideCell, type ReplaceMarketsAction } from "./OverrideCell";

export type CompetitorSetRow = CompetitorSetSettingsModel["competitors"][number] & { id: string };

function suggestionEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== "object") return "Suggested from persisted evidence.";
  const value = evidence as Record<string, unknown>;
  if (
    typeof value.seenOn === "number" &&
    typeof value.of === "number" &&
    typeof value.bestPosition === "number"
  ) {
    return `seen on ${value.seenOn} of ${value.of} keywords / best #${value.bestPosition}`;
  }
  return "Suggested from persisted evidence.";
}

function addedDate(createdAt: Date) {
  return formatDate(createdAt.toISOString().slice(0, 10), "day_first");
}

export function competitorSetColumns({
  canEdit,
  canDelete,
  markets,
  projectId,
  replaceMarkets,
  onEdit,
  onRemove,
}: {
  canEdit: boolean;
  canDelete: boolean;
  markets: CompetitorSetSettingsModel["markets"];
  projectId: string;
  replaceMarkets: ReplaceMarketsAction;
  onEdit: (competitor: CompetitorSetRow) => void;
  onRemove: (competitor: CompetitorSetRow) => void;
}): readonly DataTableColumn<CompetitorSetRow>[] {
  const columns: DataTableColumn<CompetitorSetRow>[] = [
    {
      accessorKey: "domain",
      cell: ({ row }) => <CompetitorDomainLink domain={row.original.domain} />,
      header: "Domain",
      id: "domain",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: "Domain" },
      minSize: 192,
      size: 192,
    },
    {
      accessorKey: "aliases",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.aliases.length ? (
            row.original.aliases.map((alias) => <TagChip key={alias} label={alias} />)
          ) : (
            <span className="text-fg-muted">-</span>
          )}
        </div>
      ),
      header: "Brand aliases",
      id: "aliases",
      meta: {
        flex: 1.3,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: "Brand aliases",
      },
      minSize: 216,
      size: 216,
    },
    {
      accessorKey: "scopePolicy",
      cell: ({ row }) => (
        <OverrideCell
          availableMarkets={markets}
          canEdit={canEdit}
          competitorId={row.original.publicId}
          overrides={row.original.overrides}
          projectId={projectId}
          replaceMarkets={replaceMarkets}
          scopePolicy={row.original.scopePolicy}
        />
      ),
      header: "In markets",
      id: "markets",
      meta: {
        flex: 1.2,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: "In markets",
      },
      minSize: 208,
      size: 240,
    },
    {
      accessorKey: "source",
      cell: ({ row }) => (
        <span className="text-[11px] text-fg-muted">
          <span>{row.original.source}</span>
          {row.original.source === "suggested" && row.original.evidence ? (
            <Tooltip content={suggestionEvidence(row.original.evidence)} semantics="description">
              <button className="mt-1 block text-[10px] text-fg-muted underline" type="button">
                why?
              </button>
            </Tooltip>
          ) : null}
        </span>
      ),
      header: "Source",
      id: "source",
      meta: { lockResize: true, lockVisible: true, sortable: false, title: "Source" },
      minSize: 112,
      size: 128,
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11px] text-fg-muted">
          {addedDate(row.original.createdAt)}
        </span>
      ),
      header: "Added",
      id: "added",
      meta: { lockResize: true, lockVisible: true, sortable: false, title: "Added" },
      minSize: 112,
      size: 112,
    },
  ];
  if (canEdit || canDelete)
    columns.push({
      id: "actions",
      header: "",
      size: 60,
      minSize: 60,
      maxSize: 60,
      meta: {
        align: "end",
        lockResize: true,
        lockVisible: true,
        pin: "right",
        sortable: false,
        title: "Actions",
      },
      cell: ({ row }) => (
        <RowActionsMenu
          ariaLabel={`Actions for ${row.original.domain}`}
          items={[
            ...(canEdit ? [{ label: "Edit", onSelect: () => onEdit(row.original) }] : []),
            ...(canDelete
              ? [{ label: "Remove", danger: true, onSelect: () => onRemove(row.original) }]
              : []),
          ]}
        />
      ),
    });
  return columns;
}
