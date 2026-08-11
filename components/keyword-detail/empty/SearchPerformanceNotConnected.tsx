import {
  EmptyModuleCard,
  EmptyModuleTitle,
} from "@/components/keyword-detail/empty/empty-state-primitives";

export type SearchPerformanceNotConnectedProps = {
  connectHref?: string;
};

export function SearchPerformanceNotConnected({
  connectHref = "/app/integrations",
}: Readonly<SearchPerformanceNotConnectedProps>) {
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-2">
        <EmptyModuleTitle>Search performance</EmptyModuleTitle>
        <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-mono text-[10.5px] text-fg-muted">
          Search Console
        </span>
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">Trailing 28 days</p>
      <div className="mt-4 rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-4 py-5">
        <p className="m-0 text-[13px] leading-[1.5] text-fg-muted">
          Connect Search Console to see clicks, impressions and CTR for this keyword.
        </p>
        <a
          className="mt-2 inline-flex text-[13px] font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
          href={connectHref}
        >
          Connect Search Console
        </a>
      </div>
    </EmptyModuleCard>
  );
}
