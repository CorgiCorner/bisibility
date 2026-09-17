"use client";

import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
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
}: Readonly<{
  onSearchChange: (value: string) => void;
  projectRef: string;
  rows: readonly SavedKeywordRow[];
  search: string;
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
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
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
  costCents,
  onClear,
  onRemove,
  onTrack,
  trackDisabledReason,
}: Readonly<{
  canDelete: boolean;
  canTrack: boolean;
  count: number;
  costCents: number | null;
  onClear: () => void;
  onRemove: () => void;
  onTrack: () => void;
  trackDisabledReason?: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const cost = costCents == null ? null : costCents / 100;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e8d5c9] bg-accent-soft px-4 py-[9px]">
      <strong className="whitespace-nowrap text-[13px] text-accent-text">
        {t("selected", { count })}
      </strong>
      <span className="font-sans tabular-nums text-[11px] text-[#a85c22]">
        {trackDisabledReason ??
          (cost == null ? t("trackingUnavailable", { count }) : t("trackingAll", { cost, count }))}
      </span>
      <span className="flex-1" />
      {canDelete ? (
        <Button
          onClick={onRemove}
          size="sm"
          startIcon={<Trash weight="regular" size={13} />}
          style={{
            "--control-border-color": "var(--red)",
            "--control-color": "var(--red)",
            minHeight: 30,
          }}
          variant="secondary"
        >
          {t("remove")}
        </Button>
      ) : null}
      {canTrack ? (
        <Button
          aria-label={cost == null ? t("track", { count }) : t("trackAria", { cost, count })}
          disabled={Boolean(trackDisabledReason)}
          onClick={onTrack}
          size="sm"
          style={{ minHeight: 30 }}
        >
          {t("track", { count })}
          {cost == null ? null : (
            <span className="ml-1.5 font-sans tabular-nums text-[12px] font-medium">
              {t("monthlyEstimate", { cost })}
            </span>
          )}
        </Button>
      ) : null}
      <button
        className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-fg-muted hover:text-fg"
        onClick={onClear}
        type="button"
      >
        {t("clear")}
      </button>
    </div>
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
          <button
            aria-label={t("previousPage")}
            className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border-control bg-transparent text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
            disabled={!hasPrevious}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <CaretLeft size={12} weight="regular" />
          </button>
          <button
            aria-label={t("nextPage")}
            className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border-control bg-transparent text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            <CaretRight size={12} weight="regular" />
          </button>
        </div>
      </div>
    </div>
  );
}
