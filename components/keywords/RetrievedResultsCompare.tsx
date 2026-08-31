import { Button } from "@/components/ui";
import type { RetrievedResults } from "@/lib/checks/contract";
import {
  type CompareRow,
  type CompareState,
  compareChecks,
} from "@/lib/checks/retrieved-results-model";
import { InfoIcon as Info, ProhibitIcon as Prohibit } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type RetrievedResultsCompareProps = {
  from: RetrievedResults;
  to: RetrievedResults;
  timeZone: string;
  fullCheckDates: readonly string[];
  onPickFullPair?: (fromCheckId: string, toCheckId: string) => void;
  fullPair?: { from: string; to: string } | null;
};
const STATS: ReadonlyArray<{ state: CompareState; label: string }> = [
  { state: "entered", label: "Entered" },
  { state: "up", label: "Moved up" },
  { state: "down", label: "Moved down" },
  { state: "unchanged", label: "Unchanged" },
  { state: "dropped_out", label: "Dropped out" },
];
const CHIP_CLASS: Record<CompareState, string> = {
  up: "border-green/40 bg-green/10 text-green-text",
  down: "border-red/30 bg-red/10 text-red-text",
  entered: "border-blue-300/50 bg-blue-100/50 text-blue-700",
  unchanged: "border-border bg-bg-sunken text-fg-muted",
  dropped_out: "border-amber-300/50 bg-amber-100/50 text-amber-800",
};
function makeDateFormatter(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone });
  return (iso: string) => fmt.format(new Date(iso));
}
function Position({ row }: Readonly<{ row: CompareRow }>) {
  return (
    <span className="whitespace-nowrap font-mono text-[11.5px] text-fg-muted">
      {row.from === null ? "-" : `#${row.from}`} -&gt; {row.to === null ? "-" : `#${row.to}`}
    </span>
  );
}
function Chip({ row }: Readonly<{ row: CompareRow }>) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${CHIP_CLASS[row.state]}`}
      title={row.tip}
    >
      {row.chip}
    </span>
  );
}
function ListResult({
  notice,
  result,
  trackedDomain,
}: Readonly<{
  notice: ReactNode;
  result: Extract<ReturnType<typeof compareChecks>, { kind: "list" }>;
  trackedDomain: string | null;
}>) {
  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
          {STATS.map((item) => (
            <span key={item.state}>
              <strong className="text-fg">{result.stats[item.state]}</strong>{" "}
              <span className="text-fg-muted">{item.label}</span>
            </span>
          ))}
        </div>
        <p className="m-0 text-right font-mono text-[10.5px] text-fg-muted">
          Both checks retrieved the top {result.overlap}, so the comparison covers positions 1 to{" "}
          {result.overlap}.
        </p>
      </div>
      {notice}
      <ul className="m-0 list-none p-0">
        {result.rows.map((row) => {
          const tracked = row.domain === trackedDomain;
          return (
            <li
              className={`flex min-h-[49px] flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2 sm:px-5 ${tracked ? "m-3 rounded-control border border-border-control px-3 sm:px-4" : ""}`}
              key={row.domain}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                {row.domain}
              </span>
              {tracked ? (
                <span className="rounded-full border border-accent-solid px-2.5 py-1 font-mono text-[10px] text-accent-text">
                  Your site
                </span>
              ) : null}
              <Position row={row} />
              <Chip row={row} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
function RefusedResult({
  result,
  fullPair,
  onPickFullPair,
  buttonLabel,
}: Readonly<{
  result: Extract<ReturnType<typeof compareChecks>, { kind: "refused" }>;
  fullPair?: { from: string; to: string } | null;
  onPickFullPair?: (from: string, to: string) => void;
  buttonLabel: string;
}>) {
  return (
    <div className="m-4 rounded-control border border-dashed border-border bg-bg-sunken p-4">
      <p className="m-0 flex items-center gap-2 font-mono text-[10px] text-fg-muted">
        <Prohibit aria-hidden size={13} weight="regular" />
        {result.eyebrow}
      </p>
      <h4 className="m-0 mt-1 text-[13px] font-semibold">{result.title}</h4>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{result.body}</p>
      <p className="m-0 mt-2 font-mono text-[10px] text-fg-muted">{result.rule}</p>
      {fullPair && onPickFullPair ? (
        <Button
          onClick={() => onPickFullPair(fullPair.from, fullPair.to)}
          size="xs"
          variant="secondary"
        >
          {buttonLabel}
        </Button>
      ) : null}
    </div>
  );
}
export function RetrievedResultsCompare({
  from,
  to,
  timeZone,
  fullCheckDates,
  onPickFullPair,
  fullPair,
}: Readonly<RetrievedResultsCompareProps>): ReactNode {
  const formatDate = makeDateFormatter(timeZone);
  const result = compareChecks(from, to, { formatDate, fullCheckDates });
  const trackedDomain =
    to.tier === "full" ? (to.rows.find((row) => row.tracked)?.domain ?? null) : null;
  const providerNotice =
    from.provider !== to.provider ? (
      <p className="m-0 flex items-start gap-2 border-b border-border px-4 py-4 text-[12px] leading-5 text-fg-muted sm:px-5">
        <Info aria-hidden className="mt-0.5 shrink-0" size={15} weight="regular" />
        <span>
          These checks used different providers: {from.providerLabel} ({formatDate(from.checkedAt)})
          and {to.providerLabel} ({formatDate(to.checkedAt)}). Domains entering or dropping out may
          reflect the provider switch, not movement in Google.
        </span>
      </p>
    ) : null;
  return (
    <div>
      {result.kind === "list" ? (
        <ListResult notice={providerNotice} result={result} trackedDomain={trackedDomain} />
      ) : (
        <>
          {providerNotice}
          {result.kind === "degenerate" ? (
            <p className="m-0 p-5 text-[12px] text-fg-muted">{result.note}</p>
          ) : (
            <RefusedResult
              buttonLabel={`Compare ${formatDate(from.checkedAt)} with ${formatDate(to.checkedAt)}`}
              fullPair={fullPair}
              onPickFullPair={onPickFullPair}
              result={result}
            />
          )}
        </>
      )}
    </div>
  );
}
