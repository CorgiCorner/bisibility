"use client";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { CoreMessages } from "@/i18n/core-messages.generated";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { useTranslations } from "next-intl";

type Row = { id: string; [key: string]: string | null };
function MeteringTable({
  title,
  fields,
  rows,
  empty,
}: {
  title: string;
  fields: (keyof CoreMessages["instanceAdmin"]["metering"])[];
  rows: Row[];
  empty: string;
}) {
  const t = useTranslations("instanceAdmin.metering");
  const columns: DataTableColumn<Row>[] = fields.map((field) => ({
    id: field,
    header: t(field),
    accessorFn: (row) => row[field],
    meta: { sortable: false },
    minSize: field === "connection" || field === "operation" ? 180 : 130,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs tabular-nums">
        {row.original[field] === "unlimited"
          ? t("unlimited")
          : (row.original[field] ?? t("unavailable"))}
      </span>
    ),
  }));
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-bg-elev p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold text-fg">{title}</h2>
      {rows.length ? (
        <div className="min-w-0 overflow-x-auto">
          <DataTable
            id={`metering-${fields.join("-")}`}
            ariaLabel={title}
            columns={columns}
            rows={rows}
            sorting={null}
            onSortingChange={() => undefined}
            layout="auto"
          />
        </div>
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-fg-muted">
          {empty}
        </p>
      )}
    </section>
  );
}
export function AdminMeteringView({ data }: { data: MeteringAdminData | null }) {
  const t = useTranslations("instanceAdmin.metering");
  if (!data)
    return (
      <p
        role="status"
        className="rounded-2xl border border-border bg-bg-elev p-6 text-sm text-fg-muted"
      >
        {t("unavailableNote")}
      </p>
    );
  return (
    <div className="grid min-w-0 gap-5">
      <div className="rounded-2xl border border-border bg-bg-elev p-5">
        <p className="text-xs text-fg-muted">{t("disagreements")}</p>
        <p className="mt-3 text-2xl font-semibold tabular-nums">{data.disagreements}</p>
      </div>
      {data.truncated && (
        <p role="status" className="text-sm text-fg-muted">
          {t("truncated")}
        </p>
      )}
      <MeteringTable
        title={t("usage")}
        fields={[
          "connection",
          "surface",
          "funding",
          "meter",
          "reserved",
          "legacy",
          "difference",
          "certainty",
        ]}
        rows={data.usage}
        empty={t("emptyUsage")}
      />
      <p className="text-xs text-fg-muted">{t("budgetNote")}</p>
      <MeteringTable
        title={t("budgets")}
        fields={["connection", "surface", "used", "reserved", "remaining", "resetsAt"]}
        rows={data.budgets}
        empty={t("emptyBudgets")}
      />
      <MeteringTable
        title={t("exceptions")}
        fields={["operation", "state", "updatedAt"]}
        rows={data.exceptions}
        empty={t("emptyExceptions")}
      />
    </div>
  );
}
