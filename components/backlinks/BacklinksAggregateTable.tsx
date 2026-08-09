import type { BacklinksAggregateRow, BacklinksView } from "./backlinks-table-model";

const labels: Record<Exclude<BacklinksView, "backlinks">, string> = {
  anchors: "Anchor",
  referring_domains: "Referring domain",
  top_pages: "Top page",
};

function shortDate(value: string | null) {
  return value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      })
    : "";
}

export function BacklinksAggregateTable({
  fetchedCount,
  rows,
  totalCount,
  view,
}: Readonly<{
  fetchedCount: number;
  rows: BacklinksAggregateRow[];
  totalCount: number;
  view: Exclude<BacklinksView, "backlinks">;
}>) {
  return (
    <>
      <p className="m-0 border-b border-border px-4 py-2 text-[12px] text-fg-muted">
        {labels[view]} view within fetched rows ({fetchedCount.toLocaleString("en-US")} of{" "}
        {totalCount.toLocaleString("en-US")})
      </p>
      <div className="grid grid-cols-[minmax(260px,1fr)_190px_60px_60px_70px_120px] gap-3 border-b border-border-strong px-4 py-2 font-mono text-[10px] uppercase tracking-[.08em] text-fg-muted">
        <span>{labels[view]}</span>
        <span>Coverage</span>
        <span className="text-right">DA</span>
        <span className="text-right">Spam</span>
        <span className="text-right">Links</span>
        <span>First seen</span>
      </div>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(260px,1fr)_190px_60px_60px_70px_120px] items-center gap-3 border-t border-border/70 px-4 py-2.5"
          key={row.key}
        >
          <span className="truncate text-[13px] font-medium">{row.label}</span>
          <span className="text-[12px] text-fg-muted">{row.secondary}</span>
          <span className="text-right font-mono text-[12.5px]">{row.domainAuthority}</span>
          <span
            className={`text-right font-mono text-[12.5px] ${
              row.spamScore >= 5 ? "text-yellow-text" : ""
            }`}
          >
            {row.spamScore.toFixed(1)}
          </span>
          <span className="text-right font-mono text-[12.5px] text-fg-muted">{row.linksCount}</span>
          <span className="whitespace-nowrap text-[12px] text-fg-muted">
            {shortDate(row.firstSeen)}
          </span>
        </div>
      ))}
    </>
  );
}
