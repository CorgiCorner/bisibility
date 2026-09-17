"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { useTranslations } from "next-intl";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

type Props = {
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

function Segment({
  active,
  children,
  onClick,
  disabled = false,
  title,
}: Readonly<{
  active: boolean;
  children: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}>) {
  return (
    <button
      aria-pressed={active}
      disabled={disabled}
      className={`rounded-control px-3 py-1.5 text-[12px] font-medium transition-colors ${active ? "border border-border-control bg-bg-sunken text-fg" : "border border-transparent text-fg-muted hover:text-fg"} disabled:cursor-not-allowed disabled:opacity-45`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

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
          <p className="m-0 mt-0.5 text-[12.5px] leading-5 text-fg-muted">{t("description")}</p>
        </div>
        <div className="inline-flex self-start rounded-control border border-border p-0.5">
          <Segment active={mode === "one"} onClick={() => props.onMode("one")}>
            {t("oneCheck")}
          </Segment>
          <Segment
            active={mode === "compare"}
            disabled={!props.compareEnabled}
            onClick={() => props.onMode("compare")}
            title={!props.compareEnabled ? t("needTwo") : undefined}
          >
            {t("compareTwo")}
          </Segment>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5">
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
            <ArrowRight aria-hidden className="shrink-0 text-fg-muted" size={14} weight="regular" />
            <Eyebrow>{t("to")}</Eyebrow>
          </>
        ) : null}
        <RetrievedResultsPicker
          ariaLabel={mode === "compare" ? t("laterCheck") : t("storedChecks")}
          entries={props.entries}
          formatDate={props.formatDate}
          formatDateTime={props.formatDateTime}
          leadingIcon={
            mode === "one" ? <History aria-hidden size={14} weight="regular" /> : undefined
          }
          onChange={props.onSelectTo}
          pickerRole={mode === "compare" ? "to" : "one"}
          selectedFrom={mode === "compare" ? props.compareFrom : undefined}
          value={props.selected}
        />
        {mode === "one" && props.current?.tier === "full" ? (
          <span className="rounded-full border border-border px-2.5 py-1 font-sans tabular-nums text-[11px] text-fg-muted">
            {t("retrieved", {
              requested: props.current.requestedDepth ? String(props.current.requestedDepth) : "",
              retrieved: props.current.retrievedPositions,
            })}
          </span>
        ) : null}
      </div>
    </header>
  );
}
