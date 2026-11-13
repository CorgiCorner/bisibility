"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Modal } from "@/components/ui/Modal";
import type { OverviewSpellingRow } from "@/lib/ai-tracking/overview-model";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export function AiVisibilityOverviewSpellings({
  onSplitAlias,
  rows,
}: Readonly<{
  onSplitAlias: (row: OverviewSpellingRow, alias: string) => Promise<void>;
  rows: readonly OverviewSpellingRow[];
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const [target, setTarget] = useState<{ alias: string; row: OverviewSpellingRow } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const columns = useMemo(() => spellingColumns(format, setTarget, t), [format, t]);
  if (!rows.length) return null;

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      await onSplitAlias(target.row, target.alias);
      setTarget(null);
    } catch {
      setError(t("overview.splitFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 font-sans text-ui-section">{t("overview.spellingsTitle")}</h2>
        <p className="m-0 text-ui-caption text-fg-muted">{t("overview.spellingsDescription")}</p>
      </div>
      <DataTable
        ariaLabel={t("overview.spellingsTitle")}
        columns={columns}
        density="compact"
        id="ai-visibility-spellings"
        onSortingChange={() => undefined}
        rows={rows.map((spelling) => ({ id: spelling.entityId, kind: "row" as const, spelling }))}
        sorting={null}
      />
      {target ? (
        <Modal
          description={t("overview.splitBody", { brand: target.row.label, name: target.alias })}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setTarget(null)} type="button" variant="secondary">
                {t("cancel")}
              </Button>
              <Button loading={pending} onClick={() => void confirm()} type="button">
                {t("overview.split")}
              </Button>
            </div>
          }
          onClose={() => setTarget(null)}
          open
          title={t("overview.splitTitle", { brand: target.row.label, name: target.alias })}
        >
          {error ? (
            <p className="m-0 text-ui-caption text-red-text" role="alert">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}

type SpellingTableRow = {
  id: string;
  kind: "row";
  spelling: OverviewSpellingRow;
};

function spellingColumns(
  format: ReturnType<typeof useFormatter>,
  choose: (target: { alias: string; row: OverviewSpellingRow }) => void,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
): DataTableColumn<SpellingTableRow>[] {
  return [
    {
      cell: ({ row }) => row.original.spelling.label,
      header: t("overview.columnBrand"),
      id: "brand",
      meta: { sortable: false },
    },
    {
      cell: ({ row }) =>
        row.original.spelling.names
          .map((name) => `${name.name} (${format.number(name.count)})`)
          .join(" · "),
      header: t("overview.columnWrittenAs"),
      id: "written",
      meta: { flex: 2, sortable: false },
    },
    {
      cell: ({ row }) => format.number(row.original.spelling.mentions),
      header: t("overview.columnMentions"),
      id: "mentions",
      meta: { align: "end", sortable: false },
    },
    {
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {row.original.spelling.removable.map((alias) => (
            <Button
              key={alias}
              onClick={() => choose({ alias, row: row.original.spelling })}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("overview.splitName", { name: alias })}
            </Button>
          ))}
        </span>
      ),
      id: "split",
      meta: { sortable: false },
    },
  ];
}
