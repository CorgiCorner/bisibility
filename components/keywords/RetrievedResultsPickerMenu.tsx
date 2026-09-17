"use client";

import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useTranslations } from "next-intl";
import type {
  PickerDisabledReason,
  PickerPreset,
  PickerRow,
} from "./retrieved-results-picker-model";

type Props = {
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  retainedLabel: (entry: StoredResultsIndexEntry) => string;
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
  retainedLabel: getRetainedLabel,
  onSelect,
  value,
}: Readonly<{
  entry: StoredResultsIndexEntry;
  disabledReason: PickerDisabledReason | null;
  formatDateTime: (iso: string) => string;
  onSelect: (entry: StoredResultsIndexEntry) => void;
  retainedLabel: (entry: StoredResultsIndexEntry) => string;
  value: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const selected = entry.checkId === value;
  const disabledCopy =
    disabledReason === null
      ? null
      : disabledReason === "purged"
        ? t("purged")
        : disabledReason === "selected_as_from"
          ? t("selectedAsFrom")
          : disabledReason === "selected_as_to"
            ? t("selectedAsTo")
            : disabledReason === "earlier_than_from"
              ? t("earlierThanFrom")
              : t("laterThanTo");
  const position = entry.position === null ? "" : t("position", { position: entry.position });
  const label =
    `${formatDateTime(entry.checkedAt)} ${position} ${getRetainedLabel(entry)} ${disabledCopy ?? (selected ? t("selected") : "")}`.trim();
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
        {disabledCopy ? <span className="mt-1 block text-[10.5px]">{disabledCopy}</span> : null}
      </span>
      <span className="text-right text-fg-muted">{position}</span>
      <span className="text-right text-fg-muted">{getRetainedLabel(entry)}</span>
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
  retainedLabel: getRetainedLabel,
}: Readonly<{
  preset: PickerPreset;
  formatDate: (iso: string) => string;
  onSelect: (entry: StoredResultsIndexEntry) => void;
  retainedLabel: (entry: StoredResultsIndexEntry) => string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const label =
    preset.kind === "previous" ? t("previousCheck") : t("daysAgo", { days: preset.days });
  return (
    <button
      aria-label={`${label} ${preset.entry.position === null ? "" : t("position", { position: preset.entry.position })} ${formatDate(preset.entry.checkedAt)} · ${getRetainedLabel(preset.entry)}`}
      className="grid w-full grid-cols-[minmax(0,1fr)_50px] gap-2 rounded-control px-3 py-2 text-left text-[12px] hover:bg-bg-sunken"
      onClick={() => onSelect(preset.entry)}
      role="menuitem"
      type="button"
    >
      <span>
        <strong className="block font-medium">{label}</strong>
        <span className="mt-1 block font-sans tabular-nums text-[10.5px] text-fg-muted">
          {formatDate(preset.entry.checkedAt)} · {getRetainedLabel(preset.entry)}
        </span>
      </span>
      <span className="text-right font-sans tabular-nums text-fg-muted">
        {preset.entry.position === null ? "" : t("position", { position: preset.entry.position })}
      </span>
    </button>
  );
}
export function RetrievedResultsPickerMenu({
  formatDate,
  formatDateTime,
  onSelect,
  presets,
  retainedLabel,
  rows,
  selectedTo,
  value,
}: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  return (
    <>
      {selectedTo ? (
        <Heading>{t("compareRelative", { date: formatDate(selectedTo.checkedAt) })}</Heading>
      ) : null}
      {presets.map((preset) => (
        <PresetButton
          formatDate={formatDate}
          key={`${preset.kind}-${preset.entry.checkId}`}
          onSelect={onSelect}
          preset={preset}
          retainedLabel={retainedLabel}
        />
      ))}
      {presets.length ? <div className="my-2 border-t border-border" /> : null}
      <Heading>{t("recentChecks")}</Heading>
      {rows.map((row) => (
        <RowButton
          {...row}
          formatDateTime={formatDateTime}
          key={row.entry.checkId}
          onSelect={onSelect}
          value={value}
          retainedLabel={retainedLabel}
        />
      ))}
    </>
  );
}
