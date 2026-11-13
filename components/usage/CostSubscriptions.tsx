"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import { buildLogoDevUrl } from "@/components/ui/provider-logo-url";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import type { CostKind } from "@/lib/cost-items/catalog";
import type { CostRow } from "@/lib/cost-items/present";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCostDate, useMinorMoney } from "./cost-money";

export function CostSubscriptions({
  canEdit,
  onAdd,
  onDelete,
  onEdit,
  onEnd,
  rows,
}: Readonly<{
  canEdit: boolean;
  onAdd: () => void;
  onDelete: (row: CostRow) => void;
  onEdit: (row: CostRow) => void;
  onEnd: (row: CostRow) => void;
  rows: readonly CostRow[];
}>) {
  const t = useTranslations("projectUsageCosts");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useColumns({ canEdit, onDelete, onEdit, onEnd, rows });
  const tableRows = rows.map(toTableRow);
  return (
    <Card className="flex min-w-0 flex-col gap-3" data-usage-section="subscriptions">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-ui-section">{t("card.title")}</h2>
          <p className="text-ui-caption text-fg-muted">{t("card.description")}</p>
        </div>
        {canEdit && rows.length > 0 ? (
          <Button onClick={onAdd} type="button" variant="primary">
            {t("card.add")}
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <Button onClick={onAdd} type="button" variant="primary">
                {t("card.add")}
              </Button>
            ) : null
          }
          compact
          description={t("card.emptyDescription")}
          icon={<Receipt aria-hidden size={18} weight="regular" />}
          title={t("card.emptyTitle")}
        />
      ) : (
        <DataTable
          ariaLabel={t("card.title")}
          bordered={false}
          columns={columns}
          density="compact"
          id="usage-cost-items"
          onSortingChange={setSorting}
          rows={tableRows}
          sorting={sorting}
        />
      )}
    </Card>
  );
}

type CostTableRow = Omit<CostRow, "kind"> & { itemKind: CostKind };

function toTableRow({ kind, ...row }: CostRow): CostTableRow {
  return { ...row, itemKind: kind };
}

function fromTableRow({ itemKind, ...row }: CostTableRow): CostRow {
  return { ...row, kind: itemKind };
}

function CostToolMark({ domain }: Readonly<{ domain: string | null }>) {
  const [failed, setFailed] = useState(false);
  const src =
    domain && !failed
      ? buildLogoDevUrl({ domain, token: process.env.NEXT_PUBLIC_LOGODEV_TOKEN })
      : null;
  if (!src) return null;
  return (
    // biome-ignore lint/performance/noImgElement: the mark is a remote logo and has no local glyph.
    <img
      alt=""
      className="h-4 w-4 shrink-0 rounded-control bg-white object-contain"
      decoding="async"
      height={16}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
      width={16}
    />
  );
}

function useColumns({
  canEdit,
  onDelete,
  onEdit,
  onEnd,
  rows,
}: Readonly<{
  canEdit: boolean;
  onDelete: (row: CostRow) => void;
  onEdit: (row: CostRow) => void;
  onEnd: (row: CostRow) => void;
  rows: readonly CostRow[];
}>): DataTableColumn<CostTableRow>[] {
  const t = useTranslations("projectUsageCosts");
  const money = useMinorMoney();
  const date = useCostDate();
  const showShare = rows.some((row) => row.projectShareMinor < row.itemMonthlyMinor);
  const shareColumn: DataTableColumn<CostTableRow> = {
    cell: ({ row }) => <ShareCell money={money} row={row.original} />,
    header: t("card.columns.project"),
    id: "project",
    minSize: 188,
    size: 196,
  };
  return [
    {
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <CostToolMark domain={row.original.logoDomain} />
          {row.original.name}
        </span>
      ),
      header: t("card.columns.item"),
      id: "item",
      meta: { flex: 1 },
      minSize: 160,
    },
    {
      cell: ({ row }) => t(`kinds.${row.original.itemKind}`),
      header: t("card.columns.type"),
      id: "type",
    },
    {
      cell: ({ row }) => <PlanCell date={date} row={row.original} />,
      header: t("card.columns.plan"),
      id: "plan",
    },
    {
      cell: ({ row }) => (
        <span className="tabular-nums">
          {money(row.original.currency, row.original.itemMonthlyMinor)}
        </span>
      ),
      header: t("card.columns.perMonth"),
      id: "perMonth",
      minSize: 128,
      size: 140,
    },
    ...(showShare ? [shareColumn] : []),
    {
      cell: ({ row }) =>
        canEdit ? (
          <RowActionsMenu
            ariaLabel={t("card.menu", { name: row.original.name })}
            items={[
              { label: t("card.edit"), onSelect: () => onEdit(fromTableRow(row.original)) },
              { label: t("card.end"), onSelect: () => onEnd(fromTableRow(row.original)) },
              {
                danger: true,
                label: t("card.delete"),
                onSelect: () => onDelete(fromTableRow(row.original)),
              },
            ]}
          />
        ) : null,
      header: () => <span className="sr-only">{t("card.columns.actions")}</span>,
      id: "actions",
      maxSize: 64,
      meta: { lockResize: true, title: t("card.columns.actions") },
      minSize: 64,
      size: 64,
    },
  ];
}

function ShareCell({
  money,
  row,
}: Readonly<{ money: (currency: string, minor: number) => string; row: CostTableRow }>) {
  const full = row.itemMonthlyMinor <= 0 || row.projectShareMinor >= row.itemMonthlyMinor;
  const percent = full ? null : Math.round((row.projectShareMinor * 100) / row.itemMonthlyMinor);
  return (
    <span className="tabular-nums">
      {money(row.currency, row.projectShareMinor)}
      {percent === null ? null : <span className="text-fg-muted"> · {percent}%</span>}
    </span>
  );
}

function PlanCell({ date, row }: Readonly<{ date: (value: string) => string; row: CostTableRow }>) {
  const t = useTranslations("projectUsageCosts");
  const billing =
    row.billing === "lifetime" ? (
      <Tooltip content={t("lifetimeHint")}>
        <span>{t(`billing.${row.billing}`)}</span>
      </Tooltip>
    ) : (
      t(`billing.${row.billing}`)
    );
  const note = row.note
    ? "trial" in row.note
      ? t("notes.trialUntil", { date: date(row.note.until) })
      : t("notes.discountUntil", { date: date(row.note.until), percent: row.note.percent })
    : null;
  return (
    <span className="flex flex-col">
      <span className="flex flex-wrap items-center gap-1">
        {row.planLabel ? <span>{row.planLabel}</span> : null}
        <span>{billing}</span>
      </span>
      {note ? <span className="text-sm text-fg-muted">{note}</span> : null}
    </span>
  );
}
