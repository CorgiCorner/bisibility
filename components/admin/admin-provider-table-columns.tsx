import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";

const count = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: "currency",
});

type ProviderUsageRow = InstanceAdminDashboard["stats"]["providerUsage"][number] & { id: string };

export const adminProviderUsageColumns: readonly DataTableColumn<ProviderUsageRow>[] = [
  {
    accessorFn: (row) => row.providerLabel,
    cell: ({ row }) => <span className="font-semibold text-fg">{row.original.providerLabel}</span>,
    header: "Provider",
    id: "provider",
    meta: { flex: 1, sortable: true, title: "Provider" },
    minSize: 132,
    size: 132,
  },
  {
    accessorFn: (row) => row.checks,
    cell: ({ row }) => <span>{count.format(row.original.checks)}</span>,
    header: "Completed checks",
    id: "checks",
    meta: { align: "end", sortable: true, title: "Completed checks" },
    minSize: 156,
    size: 156,
  },
  {
    accessorFn: (row) => row.billableUnits,
    cell: ({ row }) => <span>{count.format(row.original.billableUnits)}</span>,
    header: "Requests / units",
    id: "units",
    meta: { align: "end", sortable: true, title: "Requests / units" },
    minSize: 144,
    size: 144,
  },
  {
    accessorFn: (row) => (row.referenceCostKnown ? row.referenceCostCents : null),
    cell: ({ row }) => (
      <span>
        {row.original.referenceCostKnown
          ? money.format(row.original.referenceCostCents / 100)
          : "-"}
      </span>
    ),
    header: "Reference cost",
    id: "referenceCost",
    meta: { align: "end", sortable: true, title: "Reference cost" },
    minSize: 140,
    size: 140,
  },
  {
    accessorFn: (row) => row.rateBasis,
    cell: ({ row }) => <span className="text-[11px] text-fg-muted">{row.original.rateBasis}</span>,
    header: "Rate basis",
    id: "rateBasis",
    meta: { flex: 1, sortable: true, title: "Rate basis" },
    minSize: 148,
    size: 148,
  },
];

export function adminProviderUsageRows(
  usage: InstanceAdminDashboard["stats"]["providerUsage"],
): readonly ProviderUsageRow[] {
  return usage.map((row) => ({ ...row, id: row.provider }));
}
