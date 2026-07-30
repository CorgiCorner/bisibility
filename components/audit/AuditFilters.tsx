"use client";

import { MenuSelect, menuSelectPaperSx, toolbarControlClassName } from "@/components/ui";
import { pluralize } from "@/lib/format/pluralize";
import type { AuditEntry, AuditEventType, AuditStatus } from "@/lib/queries/audit";
import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  BracketsCurlyIcon as BracketsCurly,
  CalendarBlankIcon as CalendarBlank,
  CaretDownIcon as CaretDown,
  ExportIcon as Export,
  FileCsvIcon as FileCsv,
  FunnelIcon as Funnel,
  MagnifyingGlassIcon as MagnifyingGlass,
  UserIcon as User,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { AuditExportFormat } from "./audit-export";
import {
  type AuditDateRange,
  type AuditFilterState,
  dateRangeLabels,
  eventTypeLabels,
} from "./audit-filtering";

export type AuditFiltersProps = {
  actors: readonly AuditEntry["actor"][];
  eventTypes: readonly AuditEventType[];
  filters: AuditFilterState;
  onChange: (filters: AuditFilterState) => void;
  onExport: (format: AuditExportFormat) => void;
  totalCount: number;
  truncated: boolean;
  visibleCount: number;
};

// One spec shared by every button in the toolbar cluster (HANDOFF-25 §0):
// weight 500, --fg, 1px --border-strong, --bg-elev, radius 9, padding 7px 11px.
const toolbarButtonClass = cn(
  toolbarControlClassName,
  "inline-flex items-center gap-1.5 px-[11px] py-[7px] outline-none transition-colors hover:border-accent focus:border-accent",
);

function formatCount(visible: number, total: number, truncated: boolean) {
  const count =
    visible === total ? pluralize(total, "event") : `${visible} of ${pluralize(total, "event")}`;
  return truncated ? `${count} / showing newest ${total} events` : count;
}

export function AuditFilters({
  actors,
  eventTypes,
  filters,
  onChange,
  onExport,
  totalCount,
  truncated,
  visibleCount,
}: Readonly<AuditFiltersProps>) {
  const hasRows = visibleCount > 0;
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

  function setFilter<Key extends keyof AuditFilterState>(key: Key, value: AuditFilterState[Key]) {
    onChange({ ...filters, [key]: value });
  }

  function runExport(format: AuditExportFormat) {
    setExportAnchor(null);
    onExport(format);
  }

  const dateOptions = Object.entries(dateRangeLabels).map(([value, label]) => ({ label, value }));
  const eventTypeOptions = [
    { label: "Event type", value: "all" },
    ...eventTypes.map((type) => ({ label: eventTypeLabels[type], value: type })),
  ];
  const actorOptions = [
    { label: "Actor", value: "all" },
    ...actors.map((actor) => ({ label: actor.email, value: actor.email })),
  ];
  const statusOptions = [
    { label: "Status", value: "all" },
    { label: "Success", value: "success" },
    { label: "Failed", value: "failed" },
  ];

  return (
    <div className="border-b border-border px-4 py-[14px]">
      <div className="grid gap-3 xl:flex xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[7px]">
          <label
            className={cn(
              toolbarControlClassName,
              "flex min-w-[200px] flex-1 items-center gap-2 px-[11px] transition-colors focus-within:border-accent sm:flex-none",
            )}
            htmlFor="audit-filter-search"
          >
            <MagnifyingGlass aria-hidden className="shrink-0 text-fg-faint" size={14} />
            <input
              aria-label="Search audit events"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none"
              id="audit-filter-search"
              onChange={(event) => setFilter("search", event.target.value)}
              placeholder="Search actor, event, resource ID…"
              type="search"
              value={filters.search}
            />
          </label>
          <MenuSelect
            ariaLabel="Date range"
            leadingIcon={<CalendarBlank aria-hidden size={14} />}
            onChange={(next) => setFilter("dateRange", next as AuditDateRange)}
            options={dateOptions}
            value={filters.dateRange}
          />
          <MenuSelect
            ariaLabel="Event type"
            leadingIcon={<Funnel aria-hidden size={14} />}
            onChange={(next) => setFilter("eventType", next as AuditFilterState["eventType"])}
            options={eventTypeOptions}
            value={filters.eventType}
          />
          <MenuSelect
            ariaLabel="Actor"
            leadingIcon={<User aria-hidden size={14} />}
            onChange={(next) => setFilter("actor", next)}
            options={actorOptions}
            value={filters.actor}
          />
          <MenuSelect
            ariaLabel="Status"
            onChange={(next) => setFilter("status", next as AuditStatus | "all")}
            options={statusOptions}
            value={filters.status}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span className="font-mono text-[11px] text-fg-faint">
            {formatCount(visibleCount, totalCount, truncated)}
          </span>
          <button
            aria-controls={exportAnchor ? "audit-export-menu" : undefined}
            aria-expanded={exportAnchor ? "true" : undefined}
            aria-haspopup="menu"
            className={`${toolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!hasRows}
            onClick={(event) => setExportAnchor(event.currentTarget)}
            type="button"
          >
            <Export aria-hidden size={14} />
            Export
            <CaretDown aria-hidden size={12} />
          </button>
          <Menu
            anchorEl={exportAnchor}
            id="audit-export-menu"
            onClose={() => setExportAnchor(null)}
            open={Boolean(exportAnchor)}
            slotProps={{
              list: { "aria-label": "Export audit events", dense: true, sx: { padding: 0 } },
              paper: { sx: { ...menuSelectPaperSx, minWidth: 232 } },
            }}
          >
            <div className="px-3 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-faint">
              Export {pluralize(visibleCount, "event")}
            </div>
            <MenuItem onClick={() => runExport("csv")} sx={{ gap: "10px" }}>
              <FileCsv aria-hidden className="text-green" size={16} weight="fill" />
              <span className="flex flex-col">
                <span className="text-[13px] text-fg">CSV</span>
                <span className="text-[11px] text-fg-faint">Spreadsheet-ready table</span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => runExport("json")} sx={{ gap: "10px" }}>
              <BracketsCurly aria-hidden className="text-blue" size={16} />
              <span className="flex flex-col">
                <span className="text-[13px] text-fg">JSON</span>
                <span className="text-[11px] text-fg-faint">Full event payloads</span>
              </span>
            </MenuItem>
            <div className="flex items-start gap-2 border-t border-border px-3 pb-2 pt-2 text-[10px] leading-[1.35] text-fg-faint">
              <Funnel aria-hidden className="mt-px shrink-0" size={12} />
              Respects the current date and filter selection.
            </div>
          </Menu>
        </div>
      </div>
    </div>
  );
}
