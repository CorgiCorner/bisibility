import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { relativePast } from "@/lib/format/relative-time";
import { ClockIcon as Clock, GlobeSimpleIcon as GlobeSimple } from "@phosphor-icons/react";

type BacklinksSnapshotMetaProps = {
  estimateCents: number | null;
  onRefresh: () => void;
  refreshing: boolean;
  snapshot: BacklinksSnapshot;
};

function cacheLabel(cachedUntil: string, now: Date) {
  const hours = Math.max(
    0,
    Math.ceil((new Date(cachedUntil).getTime() - now.getTime()) / 3_600_000),
  );
  return `cached, free for ${hours}h`;
}

export function BacklinksSnapshotMeta({
  estimateCents,
  onRefresh,
  refreshing,
  snapshot,
}: Readonly<BacklinksSnapshotMetaProps>) {
  const now = new Date();
  const scope =
    snapshot.targetScope === "page"
      ? "Exact page"
      : `Whole site, subdomains ${snapshot.includeSubdomains ? "included" : "excluded"}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-hover">
        <GlobeSimple aria-hidden size={13} weight="bold" />
        {snapshot.target}
      </span>
      <span className="text-[12.5px] text-fg-muted">
        {scope} - snapshot {relativePast(new Date(snapshot.fetchedAt), now)}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green">
        <Clock aria-hidden size={11} />
        {cacheLabel(snapshot.cachedUntil, now)}
      </span>
      <button
        className="ml-auto cursor-pointer border-0 bg-transparent p-1 text-[12.5px] font-medium text-accent-hover hover:text-accent focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        {refreshing ? "Refreshing..." : "Refresh now"}{" "}
        {estimateCents == null ? null : (
          <span className="font-mono">~{formatEstimateCents(estimateCents)}</span>
        )}
      </button>
    </div>
  );
}
