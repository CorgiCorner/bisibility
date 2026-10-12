"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { KeywordRow } from "@/lib/queries/keywords";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { useTranslations } from "next-intl";
import { KeywordCheckScope } from "./KeywordCheckScope";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

type Props = {
  keyword?: Pick<KeywordRow, "location" | "device" | "engine">;
  compareFrom: string;
  current: RetrievedResults | null;
  entries: readonly StoredResultsIndexEntry[];
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  mode: "one" | "compare";
  compareEnabled: boolean;
  onMode: (mode: "one" | "compare") => void;
  onSelectFrom: (id: string) => void;
  onSelectTo: (id: string) => void;
  selected: string;
};

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </span>
  );
}

export function RetrievedResultsHeader(props: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const { mode } = props;
  return (
    <header className="border-b border-border" data-testid="retrieved-header">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="m-0 text-[17px] font-semibold leading-6 text-fg">
              {mode === "compare" ? t("snapshots") : t("snapshot")}
            </h2>
            <InfoTooltip text={t("titleTip")} />
          </div>
          {props.keyword ? (
            <div className="mt-2">
              <KeywordCheckScope keyword={props.keyword} />
            </div>
          ) : null}
          <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">{t("description")}</p>
        </div>
        <SegmentedControl
          ariaLabel={t("snapshot")}
          className="self-start"
          fitContent
          onChange={props.onMode}
          options={[
            { label: t("oneCheck"), value: "one" },
            {
              disabled: !props.compareEnabled,
              label: t("compareTwo"),
              tooltip: !props.compareEnabled ? t("needTwo") : undefined,
              value: "compare",
            },
          ]}
          size="toolbar"
          value={mode}
        />
      </div>
      <div className="px-4 pb-4 sm:px-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="retrieved-picker-slots">
          <div className="flex min-h-[34px] min-w-0 items-center gap-2 [&>button]:min-w-0">
            {mode === "compare" ? (
              <>
                <Eyebrow>{t("from")}</Eyebrow>
                <RetrievedResultsPicker
                  ariaLabel={t("earlierCheck")}
                  entries={props.entries}
                  formatDate={props.formatDate}
                  formatDateTime={props.formatDateTime}
                  onChange={props.onSelectFrom}
                  pickerRole="from"
                  selectedTo={props.selected}
                  value={props.compareFrom}
                />
              </>
            ) : (
              <RetrievedResultsPicker
                ariaLabel={t("storedChecks")}
                entries={props.entries}
                formatDate={props.formatDate}
                formatDateTime={props.formatDateTime}
                leadingIcon={<History aria-hidden size={14} weight="regular" />}
                onChange={props.onSelectTo}
                pickerRole="one"
                value={props.selected}
              />
            )}
          </div>
          <div className="flex min-h-[34px] min-w-0 items-center gap-2 [&>button]:min-w-0">
            {mode === "compare" ? (
              <>
                <Eyebrow>{t("to")}</Eyebrow>
                <RetrievedResultsPicker
                  ariaLabel={t("laterCheck")}
                  entries={props.entries}
                  formatDate={props.formatDate}
                  formatDateTime={props.formatDateTime}
                  onChange={props.onSelectTo}
                  pickerRole="to"
                  selectedFrom={props.compareFrom}
                  value={props.selected}
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex min-h-7 items-center">
          {mode === "one" && props.current?.tier === "full" ? (
            <span className="rounded-full border border-border px-2.5 py-1 font-sans tabular-nums text-[11px] text-fg-muted">
              {t("retrieved", {
                requested: props.current.requestedDepth ? String(props.current.requestedDepth) : "",
                retrieved: props.current.retrievedPositions,
              })}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
