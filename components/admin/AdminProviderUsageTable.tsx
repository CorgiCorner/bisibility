"use client";

import {
  adminProviderUsageColumns,
  adminProviderUsageRows,
} from "@/components/admin/admin-provider-table-columns";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export function AdminProviderUsageTable({
  usage,
}: Readonly<{ usage: InstanceAdminDashboard["stats"]["providerUsage"] }>) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.providerUsage");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const rows = useMemo(() => adminProviderUsageRows(usage), [usage]);
  const columns = useMemo(() => adminProviderUsageColumns(t, format), [format, t]);

  if (usage.length === 0) {
    return <p className="mt-4 text-xs text-fg-muted">{t("empty")}</p>;
  }

  return (
    <div className="mt-4">
      <DataTable
        bordered={false}
        ariaLabel={t("tableLabel")}
        columns={columns}
        id="admin-provider-usage-table"
        layout="auto"
        onSortingChange={setSorting}
        rows={rows}
        sorting={sorting}
        sortingMode="client"
      />
      <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">{t("note")}</p>
    </div>
  );
}
