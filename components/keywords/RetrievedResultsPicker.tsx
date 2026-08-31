"use client";

import {
  menuSelectPaperSx,
  menuTransitionDuration,
  toolbarControlClassName,
  useMenuExitLifecycle,
} from "@/components/ui";
import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { RetrievedResultsPickerMenu } from "./RetrievedResultsPickerMenu";
import {
  closestComparable,
  fromPresets,
  type PickerRole,
  pickerRows,
  retainedLabel,
} from "./retrieved-results-picker-model";

export type RetrievedResultsPickerProps = {
  ariaLabel: string;
  entries: readonly StoredResultsIndexEntry[];
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  leadingIcon?: ReactNode;
  onChange: (checkId: string) => void;
  pickerRole?: PickerRole;
  selectedFrom?: string;
  selectedTo?: string;
  value: string;
};
export function storedCheckLabel(
  entry: StoredResultsIndexEntry,
  formatDateTime: (iso: string) => string,
) {
  return `${formatDateTime(entry.checkedAt)} · ${retainedLabel(entry)}`;
}
export function RetrievedResultsPicker({
  ariaLabel,
  entries,
  formatDate,
  formatDateTime,
  leadingIcon,
  onChange,
  pickerRole = "one",
  selectedFrom,
  selectedTo,
  value,
}: Readonly<RetrievedResultsPickerProps>) {
  const [jumpDate, setJumpDate] = useState("");
  const { anchorEl, closeMenu, handleExited, open, openMenu } = useMenuExitLifecycle(() =>
    setJumpDate(""),
  );
  const selected = entries.find((entry) => entry.checkId === value);
  const to = entries.find((entry) => entry.checkId === selectedTo);
  const choose = (entry: StoredResultsIndexEntry) => {
    onChange(entry.checkId);
    closeMenu();
  };
  const rows = pickerRows(entries, pickerRole, selectedFrom, selectedTo);
  const presets = pickerRole === "from" && selectedTo ? fromPresets(entries, selectedTo) : [];
  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(
          toolbarControlClassName,
          "inline-flex min-h-[34px] max-w-full items-center gap-2 px-3 font-mono text-[12px]",
        )}
        onClick={(event) => openMenu(event.currentTarget)}
        type="button"
      >
        {leadingIcon}
        <span className="truncate">
          {selected ? storedCheckLabel(selected, formatDateTime) : ariaLabel}
        </span>
        <CaretDown aria-hidden size={11} weight="regular" />
      </button>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: {
            sx: {
              ...menuSelectPaperSx,
              maxHeight: "min(714px, calc(100dvh - 32px))",
              maxWidth: "calc(100vw - 32px)",
              minWidth: "min(560px, calc(100vw - 32px))",
              overflowY: "auto",
              width: "min(560px, calc(100vw - 32px))",
            },
          },
          transition: { onExited: handleExited },
        }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
        transitionDuration={menuTransitionDuration}
      >
        <RetrievedResultsPickerMenu
          formatDate={formatDate}
          formatDateTime={formatDateTime}
          onSelect={choose}
          presets={presets}
          rows={rows}
          selectedTo={pickerRole === "from" ? to : undefined}
          value={value}
        />
        <div className="mx-2 mt-2 border-t border-border-soft px-3 pb-3 pt-3">
          <label
            className="block font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted"
            htmlFor={`${ariaLabel}-jump-date`}
          >
            Jump to date
          </label>
          <input
            aria-label="Jump to date"
            className="mt-2 min-h-[42px] w-full rounded-control border border-border-control bg-transparent px-3 font-mono text-[12px] text-fg"
            id={`${ariaLabel}-jump-date`}
            onChange={(event) => {
              const date = event.target.value;
              setJumpDate(date);
              const match = closestComparable(entries, date, pickerRole, selectedFrom, selectedTo);
              if (match) choose(match);
            }}
            type="date"
            value={jumpDate}
          />
          <p className="m-0 mt-2 font-mono text-[10.5px] leading-4 text-fg-muted">
            Picks the closest comparable loaded check.
          </p>
        </div>
      </Menu>
    </>
  );
}
