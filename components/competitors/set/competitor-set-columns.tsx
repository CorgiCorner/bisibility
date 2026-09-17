"use client";

import { CompetitorDomainLink } from "@/components/competitors/CompetitorDomainLink";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { TagChip } from "@/components/ui/TagChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDate } from "@/lib/dates/format";
import type { CompetitorSetSettingsModel } from "@/lib/queries/competitor-set-settings";
import type { useTranslations } from "next-intl";
import { OverrideCell, type ReplaceMarketsAction } from "./OverrideCell";

export type CompetitorSetRow = CompetitorSetSettingsModel["competitors"][number] & { id: string };

type CompetitorSetTranslations = ReturnType<typeof useTranslations<"projectCompetitors.ui">>;

function suggestionEvidence(evidence: unknown, t: CompetitorSetTranslations) {
  if (!evidence || typeof evidence !== "object") return t("suggestedEvidence");
  const value = evidence as Record<string, unknown>;
  if (
    typeof value.seenOn === "number" &&
    typeof value.of === "number" &&
    typeof value.bestPosition === "number"
  ) {
    return t("suggestedEvidenceDetail", {
      bestPosition: value.bestPosition,
      of: value.of,
      seenOn: value.seenOn,
    });
  }
  return t("suggestedEvidence");
}

function addedDate(createdAt: Date, dateDisplay: DateDisplayContext) {
  return formatDisplayDate(createdAt.toISOString().slice(0, 10), dateDisplay);
}

export function competitorSetColumns({
  canEdit,
  canDelete,
  markets,
  projectId,
  replaceMarkets,
  onEdit,
  onRemove,
  dateDisplay,
  t,
}: {
  canEdit: boolean;
  canDelete: boolean;
  markets: CompetitorSetSettingsModel["markets"];
  projectId: string;
  replaceMarkets: ReplaceMarketsAction;
  onEdit: (competitor: CompetitorSetRow) => void;
  onRemove: (competitor: CompetitorSetRow) => void;
  dateDisplay: DateDisplayContext;
  t: CompetitorSetTranslations;
}): readonly DataTableColumn<CompetitorSetRow>[] {
  const columns: DataTableColumn<CompetitorSetRow>[] = [
    {
      accessorKey: "domain",
      cell: ({ row }) => <CompetitorDomainLink domain={row.original.domain} />,
      header: t("domain"),
      id: "domain",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: t("domain") },
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
      header: t("brandAliases"),
      id: "aliases",
      meta: {
        flex: 1.3,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: t("brandAliases"),
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
      header: t("inMarkets"),
      id: "markets",
      meta: {
        flex: 1.2,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: t("inMarkets"),
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
            <Tooltip content={suggestionEvidence(row.original.evidence, t)} semantics="description">
              <button className="mt-1 block text-[10px] text-fg-muted underline" type="button">
                {t("why")}
              </button>
            </Tooltip>
          ) : null}
        </span>
      ),
      header: t("source"),
      id: "source",
      meta: { lockResize: true, lockVisible: true, sortable: false, title: t("source") },
      minSize: 112,
      size: 128,
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11px] text-fg-muted">
          {addedDate(row.original.createdAt, dateDisplay)}
        </span>
      ),
      header: t("added"),
      id: "added",
      meta: { lockResize: true, lockVisible: true, sortable: false, title: t("added") },
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
        title: t("actions"),
      },
      cell: ({ row }) => (
        <RowActionsMenu
          ariaLabel={t("actionsFor", { domain: row.original.domain })}
          items={[
            ...(canEdit ? [{ label: t("edit"), onSelect: () => onEdit(row.original) }] : []),
            ...(canDelete
              ? [{ label: t("remove"), danger: true, onSelect: () => onRemove(row.original) }]
              : []),
          ]}
        />
      ),
    });
  return columns;
}
