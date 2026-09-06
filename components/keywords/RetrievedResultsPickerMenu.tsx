"use client";

import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import { CheckIcon as Check } from "@phosphor-icons/react";
import type { PickerPreset, PickerRow } from "./retrieved-results-picker-model";
import { retainedLabel } from "./retrieved-results-picker-model";

type Props = {
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  onSelect: (entry: StoredResultsIndexEntry) => void;
  presets: PickerPreset[];
  rows: PickerRow[];
  selectedTo?: StoredResultsIndexEntry;
  value: string;
};
function Heading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="m-0 px-3 pb-2 pt-3 font-sans tabular-nums text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </p>
  );
}
function RowButton({
  entry,
  disabledReason,
  formatDateTime,
  onSelect,
  value,
}: Readonly<{
  entry: StoredResultsIndexEntry;
  disabledReason: string | null;
  formatDateTime: (iso: string) => string;
  onSelect: (entry: StoredResultsIndexEntry) => void;
  value: string;
}>) {
  const selected = entry.checkId === value;
  const label =
    `${formatDateTime(entry.checkedAt)} ${entry.position === null ? "" : `#${entry.position}`} ${retainedLabel(entry)} ${disabledReason ?? (selected ? "selected" : "")}`.trim();
  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-disabled={disabledReason ? "true" : undefined}
      aria-label={label}
      disabled={Boolean(disabledReason)}
      className={`grid w-full grid-cols-[minmax(0,1fr)_50px_100px_18px] items-start gap-2 rounded-control px-3 py-2 text-left font-sans tabular-nums text-[12px] ${selected ? "bg-bg-sunken" : ""} ${disabledReason ? "cursor-not-allowed text-fg-muted opacity-65" : "text-fg hover:bg-bg-sunken"}`}
      onClick={() => {
        if (!disabledReason) onSelect(entry);
      }}
      role="menuitem"
      type="button"
    >
      <span>
        {formatDateTime(entry.checkedAt)}
        {disabledReason ? <span className="mt-1 block text-[10.5px]">{disabledReason}</span> : null}
      </span>
      <span className="text-right text-fg-muted">
        {entry.position === null ? "" : `#${entry.position}`}
      </span>
      <span className="text-right text-fg-muted">{retainedLabel(entry)}</span>
      {selected ? (
        <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
      ) : null}
    </button>
  );
}
function PresetButton({
  preset,
  formatDate,
  onSelect,
}: Readonly<{
  preset: PickerPreset;
  formatDate: (iso: string) => string;
  onSelect: (entry: StoredResultsIndexEntry) => void;
}>) {
  return (
    <button
      aria-label={`${preset.label} ${preset.entry.position === null ? "" : `#${preset.entry.position}`} ${formatDate(preset.entry.checkedAt)} · ${retainedLabel(preset.entry)}`}
      className="grid w-full grid-cols-[minmax(0,1fr)_50px] gap-2 rounded-control px-3 py-2 text-left text-[12px] hover:bg-bg-sunken"
      onClick={() => onSelect(preset.entry)}
      role="menuitem"
      type="button"
    >
      <span>
        <strong className="block font-medium">{preset.label}</strong>
        <span className="mt-1 block font-sans tabular-nums text-[10.5px] text-fg-muted">
          {formatDate(preset.entry.checkedAt)} · {retainedLabel(preset.entry)}
        </span>
      </span>
      <span className="text-right font-sans tabular-nums text-fg-muted">
        {preset.entry.position === null ? "" : `#${preset.entry.position}`}
      </span>
    </button>
  );
}
export function RetrievedResultsPickerMenu({
  formatDate,
  formatDateTime,
  onSelect,
  presets,
  rows,
  selectedTo,
  value,
}: Readonly<Props>) {
  return (
    <>
      {selectedTo ? (
        <Heading>Compare with · relative to {formatDate(selectedTo.checkedAt)}</Heading>
      ) : null}
      {presets.map((preset) => (
        <PresetButton
          formatDate={formatDate}
          key={preset.label}
          onSelect={onSelect}
          preset={preset}
        />
      ))}
      {presets.length ? <div className="my-2 border-t border-border" /> : null}
      <Heading>Recent checks</Heading>
      {rows.map((row) => (
        <RowButton
          {...row}
          formatDateTime={formatDateTime}
          key={row.entry.checkId}
          onSelect={onSelect}
          value={value}
        />
      ))}
    </>
  );
}
