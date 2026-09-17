"use client";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DateDisplayContext } from "@/lib/dates/format";
import type { AuditDateRange, AuditEntry } from "@/lib/queries/audit";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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
import { presentAuditEntry } from "./audit-presentation";
import {
  AUDIT_TABLE_DEFAULT_PAGINATION,
  AUDIT_TABLE_DEFAULT_SORT,
  AUDIT_TABLE_DENSITY,
  AUDIT_TABLE_ID,
  type AuditTablePaginationState,
  auditTablePagination,
} from "./audit-table-state";

export type AuditLogViewProps = {
  dateDisplay: DateDisplayContext;
  dateRange: AuditDateRange;
  entries: readonly AuditEntry[];
  entryLimit: number;
  retentionDays: number;
  truncated: boolean;
};

function AuditNoRows({ entryLimit }: Readonly<{ entryLimit: number }>) {
  const t = useTranslations("projectAudit.empty");

  return (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        description={t("description", { entryLimit })}
        icon={<MagnifyingGlass aria-hidden size={28} weight="regular" />}
        title={t("title")}
      />
    </div>
  );
}

export function AuditLogView({
  dateRange,
  dateDisplay,
  entries,
  entryLimit,
  retentionDays,
  truncated,
}: Readonly<AuditLogViewProps>) {
  const columnsT = useTranslations("projectAudit.columns");
  const logT = useTranslations("projectAudit.log");
  const presentationT = useTranslations("projectAudit.presentation");
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<AuditFilterState>(defaultAuditFilters);
  const [pagination, setPagination] = useState<AuditTablePaginationState>(
    AUDIT_TABLE_DEFAULT_PAGINATION,
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<DataTableSort | null>(AUDIT_TABLE_DEFAULT_SORT);
  const presentedEntries = useMemo(
    () => entries.map((entry) => presentAuditEntry(entry, dateDisplay, presentationT)),
    [dateDisplay, entries, presentationT],
  );
  const filteredEntries = useMemo(
    () => applyAuditFilters(presentedEntries, filters),
    [filters, presentedEntries],
  );
  const exportEntries = useMemo(() => {
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    return filteredEntries.flatMap((entry) => {
      const rawEntry = entriesById.get(entry.id);
      return rawEntry ? [rawEntry] : [];
    });
  }, [entries, filteredEntries]);
  const selectedEntry = useMemo(
    () => presentedEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [presentedEntries, selectedEntryId],
  );
  const selectedExportEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );
  const actors = useMemo(() => actorOptions(presentedEntries), [presentedEntries]);
  const columns = useMemo(
    () => auditColumns({ onOpenEntry: (entry) => setSelectedEntryId(entry.id), t: columnsT }),
    [columnsT],
  );
  const eventTypes = useMemo(() => eventTypeOptions(presentedEntries), [presentedEntries]);
  const activeFilters = { ...filters, dateRange };
  const tablePagination = auditTablePagination(filteredEntries.length, pagination);

  function handleFilterChange(next: AuditFilterState) {
    setPagination((current) => ({ ...current, page: 1 }));
    if (next.dateRange !== dateRange) {
      const query = next.dateRange === "30d" ? "" : `?range=${next.dateRange}`;
      router.replace(`${pathname}${query}`, { scroll: false });
      return;
    }
    setFilters(next);
  }

  return (
    <section className="flex min-w-0 flex-col gap-3.5">
      <Card className="min-w-0 overflow-hidden p-0" size="md">
        <AuditFilters
          actors={actors}
          eventTypes={eventTypes}
          filters={activeFilters}
          onChange={handleFilterChange}
          onExport={(format) => downloadAuditEntries(exportEntries, format)}
          totalCount={presentedEntries.length}
          truncated={truncated}
          visibleCount={filteredEntries.length}
        />
        <div className="min-w-0 overflow-hidden" data-testid="audit-grid-scroll-boundary">
          <div
            className="h-[min(614px,calc(100dvh-260px))] min-h-[360px] w-full min-w-0 [&>[role=table]]:border-0"
            data-testid="audit-grid-viewport"
          >
            <DataTable
              ariaLabel={logT("tableAria")}
              columns={columns}
              density={AUDIT_TABLE_DENSITY}
              emptyState={<AuditNoRows entryLimit={entryLimit} />}
              id={AUDIT_TABLE_ID}
              layout="fill"
              onPaginationChange={setPagination}
              onRowClick={(entry) => setSelectedEntryId(entry.id)}
              onSortingChange={setSorting}
              pagination={tablePagination}
              paginationMode="client"
              rows={filteredEntries}
              sorting={sorting}
              sortingMode="client"
            />
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <LockSimple aria-hidden className="text-green-text" size={14} weight="regular" />
          {logT("appendOnly", { retentionDays })}
        </span>
        <span>{logT("scope", { entryLimit })}</span>
      </div>
      <AuditDetailSheet
        entry={selectedEntry}
        exportEntry={selectedExportEntry}
        onClose={() => setSelectedEntryId(null)}
      />
    </section>
  );
}
