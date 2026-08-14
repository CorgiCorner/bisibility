import { hasUrlMismatch } from "@/lib/alerts/url-mismatch";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import { pathFromUrl } from "@/lib/queries/keyword-row-format";
import type { KeywordRow } from "@/lib/queries/keywords";
import Tooltip from "@mui/material/Tooltip";

type TargetRankingCellProps = {
  row: KeywordRow;
};

function UrlPath({ value }: Readonly<{ value: string }>) {
  return (
    <Tooltip title={value}>
      <span className="min-w-0 truncate font-mono text-[11.5px] text-fg-muted">
        {pathFromUrl(value)}
      </span>
    </Tooltip>
  );
}

function MatchStatus({ row }: Readonly<{ row: KeywordRow }>) {
  if (!row.targetUrl || !row.rankingUrl) return null;
  const mismatch = hasUrlMismatch({
    position: row.hasRankData ? row.position : null,
    rankingUrl: row.rankingUrl,
    targetUrl: row.targetUrl,
  });
  return (
    <span
      className="inline-flex h-5 shrink-0 self-center items-center rounded-full px-2 font-mono text-[9.5px] font-semibold leading-none"
      style={{
        backgroundColor: mismatch
          ? "color-mix(in srgb, var(--yellow) 14%, transparent)"
          : "color-mix(in srgb, var(--green) 14%, transparent)",
        color: mismatch ? "var(--yellow)" : "var(--green)",
      }}
    >
      {mismatch ? "Wrong URL" : "Matches"}
    </span>
  );
}

export function TargetRankingCell({ row }: Readonly<TargetRankingCellProps>) {
  const parent = marketGridParent(row);
  if (parent && parent.aggregate.rankingUrls.length > 1) {
    return (
      <Tooltip title={parent.aggregate.rankingUrls.join("\n")}>
        <span className="font-mono text-[11.5px] text-fg-muted">
          {parent.aggregate.rankingUrls.length} URLs
        </span>
      </Tooltip>
    );
  }
  const rankingLabel = row.rankingUrl
    ? pathFromUrl(row.rankingUrl)
    : row.checkState === "never_checked"
      ? "Not checked yet"
      : "Not found";

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 py-1 text-[11.5px] leading-tight">
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[48px] shrink-0 font-mono text-[9.5px] uppercase text-fg-muted">
            Target
          </span>
          {row.targetUrl ? <UrlPath value={row.targetUrl} /> : null}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[48px] shrink-0 font-mono text-[9.5px] uppercase text-fg-muted">
            Ranking
          </span>
          {row.rankingUrl ? (
            <a
              className="min-w-0 truncate font-mono text-[11.5px] text-fg-muted hover:text-accent-text hover:underline"
              href={row.rankingUrl}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer noopener"
              target="_blank"
            >
              {rankingLabel}
            </a>
          ) : (
            <span className="font-mono text-[11px] text-fg-muted">{rankingLabel}</span>
          )}
        </div>
      </div>
      <MatchStatus row={row} />
    </div>
  );
}
