"use client";

import { InfoTooltip } from "@/components/ui";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import {
  ArrowRightIcon as ArrowRight,
  ClockCounterClockwiseIcon as History,
} from "@phosphor-icons/react";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

const TITLE_TIP =
  "Checks may stop at the first tracked-domain match when that project setting is enabled. This card shows what this check kept and which positions it did not retrieve.";

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
    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </span>
  );
}

export function RetrievedResultsHeader(props: Readonly<Props>) {
  const { mode } = props;
  return (
    <header className="border-b border-border" data-testid="retrieved-header">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="m-0 text-[17px] font-semibold leading-6 text-fg">
              {mode === "compare" ? "SERP snapshots" : "SERP snapshot"}
            </h2>
            <InfoTooltip text={TITLE_TIP} />
          </div>
          <p className="m-0 mt-0.5 text-[12.5px] leading-5 text-fg-muted">
            What Google returned around your result, kept from the moment each check ran.
          </p>
        </div>
        <div className="inline-flex self-start rounded-control border border-border p-0.5">
          <Segment active={mode === "one"} onClick={() => props.onMode("one")}>
            One check
          </Segment>
          <Segment
            active={mode === "compare"}
            disabled={!props.compareEnabled}
            onClick={() => props.onMode("compare")}
            title={
              !props.compareEnabled
                ? "At least two stored checks are needed to compare."
                : undefined
            }
          >
            Compare two
          </Segment>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5">
        {mode === "compare" ? (
          <>
            <Eyebrow>From</Eyebrow>
            <RetrievedResultsPicker
              ariaLabel="Earlier check"
              entries={props.entries}
              formatDate={props.formatDate}
              formatDateTime={props.formatDateTime}
              onChange={props.onSelectFrom}
              pickerRole="from"
              selectedTo={props.selected}
              value={props.compareFrom}
            />
            <ArrowRight aria-hidden className="shrink-0 text-fg-muted" size={14} weight="regular" />
            <Eyebrow>To</Eyebrow>
          </>
        ) : null}
        <RetrievedResultsPicker
          ariaLabel={mode === "compare" ? "Later check" : "Stored checks"}
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
          <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-fg-muted">
            {props.current.retrievedPositions}
            {props.current.requestedDepth ? ` of ${props.current.requestedDepth}` : ""} retrieved
          </span>
        ) : null}
      </div>
    </header>
  );
}
