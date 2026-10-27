"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { bulkDeleteButtonStyle } from "@/components/keywords/grid/bulk-action-styles";
import { KeywordResearchAction } from "@/components/keywords/KeywordResearchAction";
import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
import { Button } from "@/components/ui/Button";
import { FloatingSelectionBar } from "@/components/ui/FloatingSelectionBar";
import { IconButton } from "@/components/ui/IconButton";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Tooltip } from "@/components/ui/Tooltip";
import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { appPath } from "@/lib/routing/app-path";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useRef } from "react";
import { downloadSavedKeywordsCsv } from "./saved-keywords-export";

export function SavedKeywordsToolbar({
  onSearchChange,
  projectRef,
  rows,
  search,
  separated = true,
}: Readonly<{
  onSearchChange: (value: string) => void;
  projectRef: string;
  rows: readonly SavedKeywordRow[];
  search: string;
  separated?: boolean;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const savedCommands = useMemo<RegisteredCommand[]>(() => {
    const cmds: RegisteredCommand[] = [
      {
        id: "sk-filter",
        label: t("filter"),
        scope: "saved-keywords",
        hint: t("filterHint"),
        run: () => searchInputRef.current?.focus(),
      },
    ];
    if (rows.length > 0) {
      cmds.push({
        id: "sk-export",
        label: t("export"),
        scope: "saved-keywords",
        hint: t("downloadCsv"),
        run: () => downloadSavedKeywordsCsv(rows),
      });
    }
    return cmds;
  }, [rows, t]);
  const savedRegisterRef = useRegisterCommands(savedCommands);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-4 py-3 ${separated ? "border-b border-border" : ""}`}
    >
      <ToolbarSearch
        className="min-w-[220px]"
        id="saved-keywords-filter"
        inputRef={searchInputRef}
        label={t("filterLabel")}
        onChange={onSearchChange}
        placeholder={t("filterPlaceholder")}
        value={search}
        variant="outlined"
      />
      <span className="flex-1" />
      <Button
        onClick={() => downloadSavedKeywordsCsv(rows)}
        size="sm"
        startIcon={<DownloadSimple weight="regular" size={14} />}
        variant="secondary"
      >
        {t("export")}
      </Button>
      <Button
        component={Link}
        endIcon={<CaretRight weight="regular" className="text-fg-muted" size={12} />}
        href={appPath(projectRef, "keyword-research")}
        size="sm"
        startIcon={<MagnifyingGlass weight="regular" size={13} />}
        variant="secondary"
      >
        {t("findMore")}
      </Button>
      <span aria-hidden hidden ref={savedRegisterRef} />
    </div>
  );
}

export function SavedKeywordsBulkBar({
  canDelete,
  canTrack,
  count,
  nativeUsage,
  onClear,
  onRemove,
  onTrack,
  projectRef,
  selectedRows,
  removeDisabledReason,
  trackDisabledReason,
}: Readonly<{
  canDelete: boolean;
  canTrack: boolean;
  count: number;
  nativeUsage: NativeUsageEstimate | null;
  onClear: () => void;
  onRemove: () => void;
  onTrack: () => void;
  projectRef: string;
  selectedRows: readonly SavedKeywordRow[];
  removeDisabledReason?: string;
  trackDisabledReason?: string;
}>) {
  const bulkT = useTranslations("projectRankTracker.keywordImport.management.bulk");
  const usage = useNativeUsageFormat();
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const quota = nativeUsage?.unit === "units";
  const known = nativeUsage != null && nativeUsage.quantity !== null && nativeUsage.unit !== null;
  const cost = (nativeUsage?.quantity ?? 0) / 100;
  const usageText = usage.format(nativeUsage);
  const summary = trackDisabledReason
    ? undefined
    : !known
      ? t("trackingUnavailable", { count })
      : quota
        ? t("trackingAllUsage", { count, usage: usageText })
        : t("trackingAll", { cost, count });
  const researchRow = count === 1 && selectedRows.length === 1 ? selectedRows[0] : undefined;
  return (
    <FloatingSelectionBar
      ariaLabel={t("toolbar")}
      clearLabel={t("clear")}
      clearTooltip={bulkT("clearTooltip")}
      count={count}
      countLabel={t("selected", { count })}
      onClear={onClear}
    >
      {canTrack ? (
        <Tooltip content={trackDisabledReason ?? summary} semantics="description">
          <Button
            aria-disabled={trackDisabledReason ? "true" : undefined}
            className="!pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
            onClick={() => {
              if (!trackDisabledReason) onTrack();
            }}
            size="xs"
          >
            {t("track", { count })}
          </Button>
        </Tooltip>
      ) : null}
      <KeywordResearchAction
        projectRef={projectRef}
        selection={
          researchRow ? { keyword: researchRow.text, location: researchRow.location } : null
        }
      />
      {canDelete ? (
        <Tooltip content={removeDisabledReason ?? t("removeTooltip")} semantics="description">
          <Button
            aria-disabled={removeDisabledReason ? "true" : undefined}
            className="!pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
            onClick={() => {
              if (!removeDisabledReason) onRemove();
            }}
            size="xs"
            startIcon={<Trash weight="regular" size={15} />}
            style={bulkDeleteButtonStyle}
            variant="secondary"
          >
            {t("remove")}
          </Button>
        </Tooltip>
      ) : null}
    </FloatingSelectionBar>
  );
}

export function SavedKeywordsFooter({
  end,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  start,
  total,
}: Readonly<{
  end: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  start: number;
  total: number;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const hasPrevious = page > 0;
  const hasNext = end < total;
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-t border-border px-4 py-3">
      <span className="font-sans tabular-nums text-[11px] text-fg-muted">{t("snapshotNote")}</span>
      <div className="flex items-center gap-5">
        <MenuSelect
          ariaLabel={t("rowsPerPage")}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={[10, 25, 50].map((value) => ({ label: String(value), value: String(value) }))}
          triggerClassName="min-w-[126px] border-0 bg-transparent px-0 font-sans tabular-nums text-[12px]"
          value={String(pageSize)}
        />
        <span className="whitespace-nowrap font-sans tabular-nums text-[12px] text-fg-muted">
          {t("range", { end, start, total })}
        </span>
        <div className="flex gap-1">
          <IconButton
            variant="secondary"
            size="small"
            aria-label={t("previousPage")}
            disabled={!hasPrevious}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <CaretLeft size={12} weight="regular" />
          </IconButton>
          <IconButton
            variant="secondary"
            size="small"
            aria-label={t("nextPage")}
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            <CaretRight size={12} weight="regular" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
