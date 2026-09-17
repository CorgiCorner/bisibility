import { Button } from "@/components/ui/Button";
import type { RetrievedResults } from "@/lib/checks/contract";
import {
  type CompareRow,
  type CompareState,
  compareChecks,
} from "@/lib/checks/retrieved-results-model";
import { matchingCompetitor, type TrackedCompetitor } from "@/lib/competitors/serp-comparison";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/dist/csr/Prohibit";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type RetrievedResultsCompareProps = {
  competitors?: readonly TrackedCompetitor[];
  from: RetrievedResults;
  formatDate?: (iso: string) => string;
  to: RetrievedResults;
  timeZone: string;
  fullCheckDates: readonly string[];
  onPickFullPair?: (fromCheckId: string, toCheckId: string) => void;
  fullPair?: { from: string; to: string } | null;
};
const STATS: readonly CompareState[] = ["entered", "up", "down", "unchanged", "dropped_out"];
const CHIP_CLASS: Record<CompareState, string> = {
  up: "border-green/40 bg-green/10 text-green-text",
  down: "border-red/30 bg-red/10 text-red-text",
  entered: "border-blue-300/50 bg-blue-100/50 text-blue-700",
  unchanged: "border-border bg-bg-sunken text-fg-muted",
  dropped_out: "border-amber-300/50 bg-amber-100/50 text-amber-800",
};
function Position({ row }: Readonly<{ row: CompareRow }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.comparison");
  return (
    <span className="whitespace-nowrap font-sans tabular-nums text-[11.5px] text-fg-muted">
      {row.from === null
        ? row.to === null
          ? "-"
          : t("positionToOnly", { position: row.to })
        : row.to === null
          ? t("positionFromOnly", { position: row.from })
          : t("positionChange", { from: row.from, to: row.to })}
    </span>
  );
}
function Chip({
  overlap,
  row,
  boundReason,
}: Readonly<{ boundReason: string; overlap: number; row: CompareRow }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.comparison");
  const stateLabel = t(
    row.state === "up"
      ? "movedUp"
      : row.state === "down"
        ? "movedDown"
        : row.state === "dropped_out"
          ? "droppedOut"
          : row.state,
  );
  const tip =
    row.state === "entered"
      ? t("enteredTip", { overlap })
      : row.state === "up"
        ? t("movedUpTip", { count: row.delta })
        : row.state === "down"
          ? t("movedDownTip", { count: row.delta })
          : row.state === "unchanged"
            ? t("unchangedTip")
            : t("droppedOutTip", { boundReason, overlap });
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-sans tabular-nums text-[10px] ${CHIP_CLASS[row.state]}`}
      title={tip}
    >
      {stateLabel}
      {row.delta > 0 ? ` ${row.delta}` : ""}
    </span>
  );
}
function ListResult({
  competitors,
  notice,
  result,
  trackedDomain,
}: Readonly<{
  competitors: readonly TrackedCompetitor[];
  notice: ReactNode;
  result: Extract<ReturnType<typeof compareChecks>, { kind: "list" }>;
  trackedDomain: string | null;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.comparison");
  const boundReason =
    result.bound.kind === "stopped"
      ? t(result.bound.relation === "earlier" ? "earlierStopped" : "laterStopped")
      : t(result.bound.relation === "earlier" ? "earlierRetrieved" : "laterRetrieved", {
          count: result.bound.overlap,
        });
  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-sans tabular-nums text-[11px]">
          {STATS.map((state) => (
            <span key={state}>
              <strong className="text-fg">{result.stats[state]}</strong>{" "}
              <span className="text-fg-muted">
                {t(
                  state === "up"
                    ? "movedUp"
                    : state === "down"
                      ? "movedDown"
                      : state === "dropped_out"
                        ? "droppedOut"
                        : state,
                )}
              </span>
            </span>
          ))}
        </div>
        <p className="m-0 text-right font-sans tabular-nums text-[10.5px] text-fg-muted">
          {t("bothChecks", { count: result.overlap })}
        </p>
      </div>
      {notice}
      <ul className="m-0 list-none p-0">
        {result.rows.map((row) => {
          const tracked = row.domain === trackedDomain;
          return (
            <li
              className={`flex min-h-[49px] flex-wrap items-center gap-2 border-b border-border px-4 py-2 sm:px-5 ${tracked ? "m-3 rounded-control border border-border-control px-3 sm:px-4" : ""}`}
              key={row.domain}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                {row.domain}
              </span>
              {tracked || matchingCompetitor(row.domain, competitors) ? (
                <span className="rounded-full border border-accent-solid px-2.5 py-1 font-sans tabular-nums text-[10px] text-accent-text">
                  {tracked ? t("yourSite") : t("competitor")}
                </span>
              ) : null}
              <Position row={row} />
              <Chip boundReason={boundReason} overlap={result.overlap} row={row} />
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
  formatDate,
  onPickFullPair,
  buttonLabel,
}: Readonly<{
  result: Extract<ReturnType<typeof compareChecks>, { kind: "refused" }>;
  fullPair?: { from: string; to: string } | null;
  formatDate: (iso: string) => string;
  onPickFullPair?: (from: string, to: string) => void;
  buttonLabel: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.comparison");
  const body =
    result.tier === "compact"
      ? t(result.relation === "earlier" ? "earlierCompact" : "laterCompact", {
          count: result.kept,
        })
      : t("noStored", { date: formatDate(result.checkedAt) });
  return (
    <div className="m-4 rounded-control border border-dashed border-border bg-bg-sunken p-4">
      <p className="m-0 flex items-center gap-2 font-sans tabular-nums text-[10px] text-fg-muted">
        <Prohibit aria-hidden size={13} weight="regular" />
        {t("notComparable")}
      </p>
      <h4 className="m-0 mt-1 text-[13px] font-semibold">{t("cannotCompare")}</h4>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{body}</p>
      <p className="m-0 mt-2 font-sans tabular-nums text-[10px] text-fg-muted">{t("fullOnly")}</p>
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
  competitors = [],
  formatDate = (iso) => iso.slice(0, 10),
  from,
  to,
  timeZone: _timeZone,
  fullCheckDates,
  onPickFullPair,
  fullPair,
}: Readonly<RetrievedResultsCompareProps>): ReactNode {
  const t = useTranslations("projectRankTracker.keywordDetail.comparison");
  const result = compareChecks(from, to, { fullCheckDates });
  const trackedDomain =
    to.tier === "full" ? (to.rows.find((row) => row.tracked)?.domain ?? null) : null;
  const providerNotice =
    from.provider !== to.provider ? (
      <p className="m-0 flex items-start gap-2 border-b border-border px-4 py-4 text-[12px] leading-5 text-fg-muted sm:px-5">
        <Info aria-hidden className="mt-0.5 shrink-0" size={15} weight="regular" />
        <span>
          {t("differentProviders", {
            fromDate: formatDate(from.checkedAt),
            fromProvider: from.providerLabel,
            toDate: formatDate(to.checkedAt),
            toProvider: to.providerLabel,
          })}
        </span>
      </p>
    ) : null;
  return (
    <div>
      {result.kind === "list" ? (
        <ListResult
          competitors={competitors}
          notice={providerNotice}
          result={result}
          trackedDomain={trackedDomain}
        />
      ) : (
        <>
          {providerNotice}
          {result.kind === "degenerate" ? (
            <p className="m-0 p-5 text-[12px] text-fg-muted">
              {result.reason === "moved_up_limited"
                ? t("movedUpLimited", { from: result.from, to: result.to })
                : t("insufficientOverlap")}
            </p>
          ) : (
            <RefusedResult
              buttonLabel={t("comparePair", {
                from: formatDate(from.checkedAt),
                to: formatDate(to.checkedAt),
              })}
              fullPair={fullPair}
              formatDate={formatDate}
              onPickFullPair={onPickFullPair}
              result={result}
            />
          )}
        </>
      )}
    </div>
  );
}
