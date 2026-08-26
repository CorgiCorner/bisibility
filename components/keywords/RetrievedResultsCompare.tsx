import { Button, MonoText } from "@/components/ui";
import type { RetrievedResults } from "@/lib/checks/contract";
import {
  type CompareRow,
  type CompareState,
  compareChecks,
} from "@/lib/checks/retrieved-results-model";
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

const chipSx: Record<CompareState, { bg: string; fg: string; border: string }> = {
  up: {
    bg: "color-mix(in srgb, var(--green) 12%, transparent)",
    fg: "var(--green-text)",
    border: "var(--green)",
  },
  down: {
    bg: "color-mix(in srgb, var(--red) 12%, transparent)",
    fg: "var(--red-text)",
    border: "var(--red)",
  },
  entered: { bg: "var(--bg-sunken)", fg: "var(--fg-muted)", border: "var(--border)" },
  unchanged: { bg: "var(--bg-sunken)", fg: "var(--fg-muted)", border: "var(--border)" },
  dropped_out: { bg: "var(--bg-sunken)", fg: "var(--fg-muted)", border: "var(--border)" },
};

function makeDateFormatter(timeZone: string): (iso: string) => string {
  const fmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone });
  return (iso: string) => fmt.format(new Date(iso));
}

function StatCell({ count, label }: Readonly<{ count: number; label: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <MonoText size="lg">{count}</MonoText>
      <span className="text-[10px] text-fg-muted">{label}</span>
    </div>
  );
}

function Chip({ row }: Readonly<{ row: CompareRow }>) {
  const style = chipSx[row.state];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
      style={{ backgroundColor: style.bg, border: `1px solid ${style.border}`, color: style.fg }}
      title={row.tip}
    >
      {row.chip}
    </span>
  );
}

function ListResult({
  result,
  overlapNote,
  tailNote,
}: Readonly<{
  result: Extract<ReturnType<typeof compareChecks>, { kind: "list" }>;
  overlapNote: string;
  tailNote: string;
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {STATS.map((s) => (
          <StatCell key={s.state} count={result.stats[s.state]} label={s.label} />
        ))}
      </div>
      <p className="m-0 text-[11px] text-fg-muted">{overlapNote}</p>
      <ul className="m-0 flex flex-col gap-1.5 p-0">
        {result.rows.map((row) => (
          <li className="flex items-center justify-between gap-3" key={row.domain}>
            <span className="truncate text-[12px] text-fg">{row.domain}</span>
            <span className="flex shrink-0 items-center gap-2">
              {row.state === "dropped_out" ? (
                <MonoText muted size="md">
                  was #{row.from}
                </MonoText>
              ) : (
                <MonoText muted size="md">
                  #{row.to}
                </MonoText>
              )}
              <Chip row={row} />
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[11px] text-fg-muted">{tailNote}</p>
    </div>
  );
}

function RefusedResult({
  result,
  fromCheckedAt,
  toCheckedAt,
  formatDate,
  fullPair,
  onPickFullPair,
}: Readonly<{
  result: Extract<ReturnType<typeof compareChecks>, { kind: "refused" }>;
  fromCheckedAt: string;
  toCheckedAt: string;
  formatDate: (iso: string) => string;
  fullPair?: { from: string; to: string } | null;
  onPickFullPair?: (fromCheckId: string, toCheckId: string) => void;
}>) {
  const showButton = fullPair && onPickFullPair;
  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-dashed border-border p-4"
      style={{ backgroundColor: "var(--bg-sunken)" }}
    >
      <MonoText muted size="md">
        {result.eyebrow}
      </MonoText>
      <h4 className="m-0 text-[13px] font-semibold text-fg">{result.title}</h4>
      <p className="m-0 text-[12px] text-fg-muted">{result.body}</p>
      <p className="m-0 font-mono text-[10px] text-fg-muted">{result.rule}</p>
      {showButton ? (
        <Button
          onClick={() =>
            onPickFullPair?.((fullPair as { from: string }).from, (fullPair as { to: string }).to)
          }
          size="xs"
          variant="secondary"
        >
          {`Compare ${formatDate(fromCheckedAt)} with ${formatDate(toCheckedAt)}`}
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
  const crossProvider = from.provider !== to.provider;

  return (
    <div className="flex flex-col gap-3">
      {crossProvider ? (
        <p className="m-0 text-[11px] text-fg-muted">
          {`Compared across providers: ${from.providerLabel} then ${to.providerLabel}. Some domains entering or dropping out can reflect the provider change rather than movement in Google.`}
        </p>
      ) : null}
      {result.kind === "list" ? (
        <ListResult result={result} overlapNote={result.overlapNote} tailNote={result.tailNote} />
      ) : result.kind === "degenerate" ? (
        <p className="m-0 text-[12px] text-fg-muted">{result.note}</p>
      ) : (
        <RefusedResult
          result={result}
          fromCheckedAt={from.checkedAt}
          toCheckedAt={to.checkedAt}
          formatDate={formatDate}
          fullPair={fullPair}
          onPickFullPair={onPickFullPair}
        />
      )}
    </div>
  );
}
