"use client";

import { DataGrid } from "@/components/keywords/grid/DataGrid";
import { dataGridHeaderSx } from "@/components/keywords/grid/keyword-data-grid-config";
import { Card, EmptyState } from "@/components/ui";
import type { AuditDateRange, AuditEntry } from "@/lib/queries/audit";
import type { GridRowParams } from "@mui/x-data-grid";
import {
  LockSimpleIcon as LockSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { AuditDetailSheet } from "./AuditDetailSheet";
import { AuditFilters } from "./AuditFilters";
import { auditColumns } from "./audit-columns";
import { downloadAuditEntries } from "./audit-export";
import {
  type AuditFilterState,
  actorOptions,
  applyAuditFilters,
  defaultAuditFilters,
  eventTypeOptions,
} from "./audit-filtering";

export type AuditLogViewProps = {
  dateRange: AuditDateRange;
  entries: readonly AuditEntry[];
  entryLimit: number;
  retentionDays: number;
  truncated: boolean;
};

const AuditEntryLimitContext = createContext(200);

const initialGridState = {
  pagination: { paginationModel: { pageSize: 10 } },
  sorting: { sortModel: [{ field: "timestamp", sort: "desc" }] },
} as const;

const gridSx = {
  border: 0,
  color: "var(--fg)",
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  "& .MuiDataGrid-cell": {
    alignItems: "center",
    borderColor: "var(--border-soft)",
    display: "flex",
    lineHeight: "normal",
    outline: "none",
  },
  "& .MuiDataGrid-columnHeaders": dataGridHeaderSx,
  "& .MuiDataGrid-footerContainer": { borderColor: "var(--border)" },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  "& .MuiDataGrid-row:hover": { backgroundColor: "var(--bg-sunken)" },
};

function AuditNoRowsOverlay() {
  const entryLimit = useContext(AuditEntryLimitContext);
  return (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        description={`Adjust the filters to search up to the ${entryLimit} most recent events in this date range.`}
        icon={<MagnifyingGlass aria-hidden size={28} />}
        title="No audit events match"
      />
    </div>
  );
}

const gridSlots = {
  noRowsOverlay: AuditNoRowsOverlay,
};

export function AuditLogView({
  dateRange,
  entries,
  entryLimit,
  retentionDays,
  truncated,
}: Readonly<AuditLogViewProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<AuditFilterState>(defaultAuditFilters);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const filteredEntries = useMemo(() => applyAuditFilters(entries, filters), [entries, filters]);
  const actors = useMemo(() => actorOptions(entries), [entries]);
  const eventTypes = useMemo(() => eventTypeOptions(entries), [entries]);
  // The date range is server-driven via the URL; keep the select in sync with the resolved value.
  const activeFilters = { ...filters, dateRange };

  function openEntry(params: GridRowParams<AuditEntry>) {
    setSelectedEntry(params.row);
  }

  // Date range re-queries on the server (RSC); the other facets stay in-page client state.
  function handleFilterChange(next: AuditFilterState) {
    if (next.dateRange !== dateRange) {
      const query = next.dateRange === "30d" ? "" : `?range=${next.dateRange}`;
      router.replace(`${pathname}${query}`, { scroll: false });
      return;
    }
    setFilters(next);
  }

  return (
    <section className="flex min-w-0 flex-col gap-[14px]">
      <Card className="min-w-0 overflow-hidden p-0" size="md">
        <AuditFilters
          actors={actors}
          eventTypes={eventTypes}
          filters={activeFilters}
          onChange={handleFilterChange}
          onExport={(format) => downloadAuditEntries(filteredEntries, format)}
          totalCount={entries.length}
          truncated={truncated}
          visibleCount={filteredEntries.length}
        />
        <div className="min-w-0 overflow-x-auto">
          <div className="h-[min(614px,calc(100dvh-260px))] min-h-[360px] min-w-[920px]">
            <AuditEntryLimitContext.Provider value={entryLimit}>
              <DataGrid
                aria-label="Audit log"
                columnHeaderHeight={42}
                columns={auditColumns}
                disableRowSelectionOnClick
                getRowId={(row) => row.id}
                hideFooterSelectedRowCount
                initialState={initialGridState}
                onRowClick={openEntry}
                pageSizeOptions={[10, 25, 50]}
                pagination
                rowHeight={52}
                rows={filteredEntries}
                slots={gridSlots}
                sx={gridSx}
              />
            </AuditEntryLimitContext.Provider>
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <LockSimple aria-hidden className="text-green-text" size={14} />
          Append-only / retained {retentionDays} days
        </span>
        <span>
          Filters search up to {entryLimit} most recent events / Visible to Admin &amp; Auditor
          roles
        </span>
      </div>
      <AuditDetailSheet entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </section>
  );
}
