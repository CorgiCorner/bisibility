"use client";

import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { MenuSelect, menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import type { AuditEntry, AuditEventType, AuditStatus } from "@/lib/queries/audit";
import { cn } from "@/lib/ui/cn";
import { BracketsCurlyIcon as BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { FileCsvIcon as FileCsv } from "@phosphor-icons/react/dist/csr/FileCsv";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserIcon as User } from "@phosphor-icons/react/dist/csr/User";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import type { AuditExportFormat } from "./audit-export";
import type { AuditDateRange, AuditFilterState } from "./audit-filtering";

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
// weight 500, --fg, 1px --border-control, --bg-elev, radius 9, padding 7px 11px.
const toolbarButtonClass = cn(
  toolbarControlClassName,
  "inline-flex items-center gap-1.5 px-[11px] py-[7px] outline-none transition-colors hover:border-accent focus:border-accent",
);

type AuditFiltersTranslations = ReturnType<typeof useTranslations<"projectAudit.filters">>;

function eventTypeLabel(type: AuditEventType, t: AuditFiltersTranslations) {
  switch (type) {
    case "auth":
      return t("eventAuth");
    case "data":
      return t("eventData");
    case "export":
      return t("eventExport");
    case "import":
      return t("eventImport");
    case "permissions":
      return t("eventPermissions");
    case "system":
      return t("eventSystem");
  }
}

function formatCount(
  visible: number,
  total: number,
  truncated: boolean,
  t: AuditFiltersTranslations,
) {
  const count =
    visible === total ? t("totalCount", { count: total }) : t("count", { total, visible });
  return truncated ? t("truncatedCount", { count, total }) : count;
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
  const t = useTranslations("projectAudit.filters");
  const hasRows = visibleCount > 0;
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const auditCommands = useMemo<RegisteredCommand[]>(() => {
    const cmds: RegisteredCommand[] = [
      {
        id: "audit-filter",
        label: t("commandFilter"),
        scope: "audit",
        hint: t("commandFilterHint"),
        run: () => searchInputRef.current?.focus(),
      },
    ];
    if (hasRows) {
      cmds.push({
        id: "audit-export",
        label: t("commandExport"),
        scope: "audit",
        hint: t("commandExportHint"),
        run: () => onExport("csv"),
      });
    }
    return cmds;
  }, [hasRows, onExport, t]);
  const auditRegisterRef = useRegisterCommands(auditCommands);

  function setFilter<Key extends keyof AuditFilterState>(key: Key, value: AuditFilterState[Key]) {
    onChange({ ...filters, [key]: value });
  }

  function runExport(format: AuditExportFormat) {
    setExportAnchor(null);
    onExport(format);
  }

  const dateOptions = [
    { label: t("date7d"), value: "7d" },
    { label: t("date30d"), value: "30d" },
    { label: t("date90d"), value: "90d" },
    { label: t("dateAll"), value: "all" },
  ];
  const eventTypeOptions = [
    { label: t("eventAll"), value: "all" },
    ...eventTypes.map((type) => ({ label: eventTypeLabel(type, t), value: type })),
  ];
  const actorOptions = [
    { label: t("actorAll"), value: "all" },
    ...actors.map((actor) => ({ label: actor.email, value: actor.email })),
  ];
  const statusOptions = [
    { label: t("statusAll"), noWrap: true, value: "all" },
    { label: t("statusSuccess"), noWrap: true, value: "success" },
    { label: t("statusFailed"), noWrap: true, value: "failed" },
  ];

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-[7px]"
          data-testid="audit-filter-controls"
        >
          <ToolbarSearch
            className="min-w-[200px] flex-1 sm:flex-none"
            id="audit-filter-search"
            inputRef={searchInputRef}
            label={t("searchLabel")}
            onChange={(value) => setFilter("search", value)}
            placeholder={t("searchPlaceholder")}
            value={filters.search}
          />
          <MenuSelect
            ariaLabel={t("dateRange")}
            leadingIcon={<CalendarBlank aria-hidden size={14} weight="regular" />}
            onChange={(next) => setFilter("dateRange", next as AuditDateRange)}
            options={dateOptions}
            value={filters.dateRange}
          />
          <MenuSelect
            ariaLabel={t("eventType")}
            leadingIcon={<Funnel aria-hidden size={14} weight="regular" />}
            onChange={(next) => setFilter("eventType", next as AuditFilterState["eventType"])}
            options={eventTypeOptions}
            value={filters.eventType}
          />
          <MenuSelect
            ariaLabel={t("actor")}
            leadingIcon={<User aria-hidden size={14} weight="regular" />}
            onChange={(next) => setFilter("actor", next)}
            options={actorOptions}
            value={filters.actor}
          />
          <MenuSelect
            ariaLabel={t("status")}
            menuMinWidth={160}
            onChange={(next) => setFilter("status", next as AuditStatus | "all")}
            options={statusOptions}
            value={filters.status}
          />
          <button
            aria-controls={exportAnchor ? "audit-export-menu" : undefined}
            aria-expanded={exportAnchor ? "true" : undefined}
            aria-haspopup="menu"
            className={`${toolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!hasRows}
            onClick={(event) => setExportAnchor(event.currentTarget)}
            type="button"
          >
            <UploadSimple aria-hidden size={14} weight="regular" />
            {t("export")}
            <CaretDown aria-hidden size={12} weight="regular" />
          </button>
          <Menu
            anchorEl={exportAnchor}
            id="audit-export-menu"
            onClose={() => setExportAnchor(null)}
            open={Boolean(exportAnchor)}
            listProps={{ "aria-label": t("exportMenuAria"), style: { padding: 0 } }}
            contentProps={{ style: { ...menuSelectPaperStyle, minWidth: 232 } }}
          >
            <div className="px-3 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.6px] text-fg-muted">
              {t("exportEvents", { count: visibleCount })}
            </div>
            <MenuItem onClick={() => runExport("csv")} style={{ gap: "10px" }}>
              <FileCsv aria-hidden className="text-green-text" size={16} weight="regular" />
              <span className="flex flex-col">
                <span className="text-[13px] text-fg">CSV</span>
                <span className="text-[11px] tabular-nums text-fg-muted">
                  {t("csvDescription")}
                </span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => runExport("json")} style={{ gap: "10px" }}>
              <BracketsCurly aria-hidden className="text-blue-text" size={16} weight="regular" />
              <span className="flex flex-col">
                <span className="text-[13px] text-fg">JSON</span>
                <span className="text-[11px] tabular-nums text-fg-muted">
                  {t("jsonDescription")}
                </span>
              </span>
            </MenuItem>
            <div className="-mx-1.5 flex items-start gap-2 border-t border-border px-[18px] pb-2 pt-2 text-[10px] leading-[1.35] text-fg-muted">
              <Funnel aria-hidden className="mt-px shrink-0" size={12} weight="regular" />
              {t("exportScope")}
            </div>
          </Menu>
        </div>
        <span className="text-[11px] tabular-nums text-fg-muted">
          {formatCount(visibleCount, totalCount, truncated, t)}
        </span>
      </div>
      <span aria-hidden hidden ref={auditRegisterRef} />
    </div>
  );
}
