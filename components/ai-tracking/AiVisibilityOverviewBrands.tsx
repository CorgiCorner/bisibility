"use client";

import { BrandNamesDrawer } from "@/components/ai-tracking/BrandNamesDrawer";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { ValueBar } from "@/components/ui/ValueBar";
import type {
  BrandNameCount,
  ProjectBrandNamesView,
} from "@/lib/ai-tracking/brand-name-projection";
import type { BrandNameDraft } from "@/lib/ai-tracking/brand-name-schema";
import type { AiVisibilityOverview, OverviewBrandRow } from "@/lib/ai-tracking/overview-model";
import { normalizeDomain } from "@/lib/domains/normalize";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { aiVisibilityTableLayouts } from "./ai-visibility-column-layout";

type NameTarget = { entityId: string; entityKind: "competitor" | "project" };

export function AiVisibilityOverviewBrands({
  brandNames,
  canAddCompetitor,
  competitorsHref,
  onAddCompetitor,
  onPreviewNames,
  onSaveNames,
  overview,
}: Readonly<{
  brandNames: ProjectBrandNamesView;
  canAddCompetitor: boolean;
  competitorsHref: string;
  onAddCompetitor: (domain: string) => Promise<void>;
  onPreviewNames: (entity: NameTarget, draft: BrandNameDraft) => Promise<BrandNameCount>;
  onSaveNames: (entity: NameTarget, draft: BrandNameDraft) => Promise<void>;
  overview: AiVisibilityOverview;
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const [names, setNames] = useState<OverviewBrandRow | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = overview.brands.find((row) => row.kind === "project") ?? null;
  const editing =
    names && (names.kind === "competitor" || names.kind === "project")
      ? { entityKind: names.kind, row: names }
      : null;
  const columns = useMemo(
    () => brandColumns(format, overview.totalAnswers, t),
    [format, overview.totalAnswers, t],
  );
  const rows = overview.brands.map((brand, index) => ({
    brand,
    id: brand.id,
    kind: "row" as const,
    rank: index + 1,
  }));

  async function add(domain: string) {
    setPending(domain);
    setError(null);
    try {
      await onAddCompetitor(domain);
    } catch {
      setError(t("overview.addFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 font-sans text-ui-section">{t("overview.brandsTitle")}</h2>
          <p className="m-0 text-ui-caption text-fg-muted">{t("overview.brandsDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project ? (
            <Button onClick={() => setNames(project)} size="sm" type="button" variant="secondary">
              {t("brandNames.yourBrandNames")}
            </Button>
          ) : null}
          <Button component={Link} href={competitorsHref} size="sm" variant="ghost">
            {t("overview.editCompetitors")}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="m-0 text-ui-caption text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable
        ariaLabel={t("overview.brandsTitle")}
        columns={[
          ...columns,
          {
            cell: ({ row }) =>
              rowAction(row.original.brand, canAddCompetitor, pending, setNames, add, t),
            id: "action",
            meta: {
              lockResize: aiVisibilityTableLayouts.brands.action.lockResize,
              sortable: false,
            },
            minSize: aiVisibilityTableLayouts.brands.action.minSize,
            size: aiVisibilityTableLayouts.brands.action.size,
          },
        ]}
        density="compact"
        id="ai-visibility-brands"
        onSortingChange={() => undefined}
        rows={rows}
        sorting={null}
      />
      {editing ? (
        <BrandNamesDrawer
          canWrite={brandNames.canWrite}
          domain={editing.row.domain}
          domainSuggestion={editing.entityKind === "project" ? brandNames.domainSuggestion : null}
          entityId={editing.row.id}
          entityKind={editing.entityKind}
          initialAliases={[...editing.row.aliases]}
          initialCounts={{
            answers: overview.totalAnswers,
            named: editing.row.mentions ?? 0,
            names: [...editing.row.nameCounts],
          }}
          initialExcludedNames={[...editing.row.excludedNames]}
          key={editing.row.id}
          keywordSuggestions={editing.entityKind === "project" ? brandNames.keywordSuggestions : []}
          label={editing.row.label}
          onClose={() => setNames(null)}
          open
          preview={(draft) =>
            onPreviewNames({ entityId: editing.row.id, entityKind: editing.entityKind }, draft)
          }
          save={(draft) =>
            onSaveNames({ entityId: editing.row.id, entityKind: editing.entityKind }, draft)
          }
        />
      ) : null}
    </section>
  );
}

type BrandTableRow = {
  brand: OverviewBrandRow;
  id: string;
  kind: "row";
  rank: number;
};

const brandLayout = aiVisibilityTableLayouts.brands;

function brandColumns(
  format: ReturnType<typeof useFormatter>,
  total: number,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
): DataTableColumn<BrandTableRow>[] {
  return [
    {
      cell: ({ row }) => format.number(row.original.rank),
      header: t("overview.columnRank"),
      id: "rank",
      meta: { align: "end", sortable: false },
      size: brandLayout.rank.size,
    },
    {
      cell: ({ row }) => (
        <BrandLabel
          row={row.original.brand}
          seen={t("overview.seenInAnswers")}
          you={t("overview.you")}
        />
      ),
      header: t("overview.columnBrand"),
      id: "brand",
      meta: { flex: brandLayout.brand.flex, sortable: false },
      minSize: brandLayout.brand.minSize,
      size: brandLayout.brand.size,
    },
    {
      cell: ({ row }) =>
        row.original.brand.answersNamed === null
          ? t("overview.unknownCount")
          : t("overview.countOf", { count: row.original.brand.answersNamed, total }),
      header: t("overview.columnAnswers"),
      id: "answers",
      meta: { sortable: false },
      size: brandLayout.answers.size,
    },
    {
      cell: ({ row }) => (
        <ShareCell row={row.original.brand} unknown={t("overview.unknownCount")} />
      ),
      header: t("overview.shareOfVoice"),
      id: "share",
      meta: { sortable: false },
      size: brandLayout.share.size,
    },
    {
      cell: ({ row }) => format.number(row.original.brand.links),
      header: t("overview.columnLinks"),
      id: "links",
      meta: { align: "end", sortable: false },
      size: brandLayout.links.size,
    },
  ];
}

function BrandLabel({
  row,
  seen,
  you,
}: Readonly<{ row: OverviewBrandRow; seen: string; you: string }>) {
  const name = <span className="block truncate">{row.label}</span>;
  const badge = row.kind === "project" ? you : row.kind === "candidate" ? seen : null;
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
      {row.domain ? (
        <Tooltip content={row.domain} wrapperClassName="block w-full min-w-0">
          {name}
        </Tooltip>
      ) : (
        name
      )}
      {badge ? (
        <PillBadge className="max-w-full whitespace-nowrap" size="xs">
          {badge}
        </PillBadge>
      ) : null}
    </span>
  );
}

function ShareCell({ row, unknown }: Readonly<{ row: OverviewBrandRow; unknown: string }>) {
  const format = useFormatter();
  if (!row.share) return unknown;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="w-12 shrink-0 tabular-nums">
        {format.number(row.share.mentions / row.share.total, {
          maximumFractionDigits: 0,
          style: "percent",
        })}
      </span>
      <ValueBar
        className="max-w-24"
        max={row.share.total}
        tone="positive"
        value={row.share.mentions}
      />
    </span>
  );
}

function rowAction(
  row: OverviewBrandRow,
  canAddCompetitor: boolean,
  pending: string | null,
  openNames: (row: OverviewBrandRow) => void,
  add: (domain: string) => void,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  if (row.kind !== "candidate") {
    return (
      <Button
        className="whitespace-nowrap"
        onClick={() => openNames(row)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("overview.namesAction")}
      </Button>
    );
  }
  const domain = row.domain ? normalizeDomain(row.domain) : null;
  if (!canAddCompetitor || !domain || domain !== row.domain) return null;
  return (
    <Button
      className="whitespace-nowrap"
      disabled={pending !== null}
      loading={pending === domain}
      onClick={() => add(domain)}
      size="sm"
      type="button"
      variant="secondary"
    >
      {t("overview.addCompetitor")}
    </Button>
  );
}
