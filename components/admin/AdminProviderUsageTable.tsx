"use client";

import {
  adminProviderUsageColumns,
  adminProviderUsageRows,
} from "@/components/admin/admin-provider-table-columns";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useMemo, useState } from "react";

export function AdminProviderUsageTable({
  usage,
}: Readonly<{ usage: InstanceAdminDashboard["stats"]["providerUsage"] }>) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const rows = useMemo(() => adminProviderUsageRows(usage), [usage]);

  if (usage.length === 0) {
    return <p className="mt-4 text-xs text-fg-muted">No completed SERP checks this month.</p>;
  }

  return (
    <div className="mt-4 [&>[role=table]]:border-0">
      <DataTable
        ariaLabel="SERP usage this month by provider"
        columns={adminProviderUsageColumns}
        id="admin-provider-usage-table"
        layout="auto"
        onSortingChange={setSorting}
        rows={rows}
        sorting={sorting}
        sortingMode="client"
      />
      <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">
        Reference estimates use maintained provider rates and recorded request units. User-entered
        costs are ignored; provider invoices remain authoritative.
      </p>
    </div>
  );
}
