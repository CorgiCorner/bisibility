import {
  StoredResultFreshness,
  type StoredResultFreshness as StoredResultFreshnessData,
} from "@/components/demo-research/StoredResultFreshness";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import { relativePastFact } from "@/lib/format/relative-time";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { wholeSecondsRemaining } from "@/lib/ui/format-duration";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { ClockIcon as Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { GlobeSimpleIcon as GlobeSimple } from "@phosphor-icons/react/dist/csr/GlobeSimple";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type BacklinksSnapshotMetaProps = {
  estimateCents: number | null;
  refreshPrice?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  snapshot: Omit<BacklinksSnapshot, "cachedUntil"> & { cachedUntil?: string };
  storedFreshness?: StoredResultFreshnessData;
};

function relativePastLabel(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"projectBacklinks.workspace.snapshot">>,
) {
  const fact = relativePastFact(date, now);
  if (fact.kind === "justNow") return t("relative.justNow");
  if (fact.kind === "yesterday") return t("relative.yesterday");
  if (fact.kind === "minutesAgo") return t("relative.minutesAgo", { count: fact.count });
  if (fact.kind === "hoursAgo") return t("relative.hoursAgo", { count: fact.count });
  return t("relative.daysAgo", { count: fact.count });
}

export function BacklinksSnapshotMeta({
  refreshPrice,
  onRefresh,
  refreshing,
  snapshot,
  storedFreshness,
}: Readonly<BacklinksSnapshotMetaProps>) {
  const t = useTranslations("projectBacklinks.workspace.snapshot");
  const formatDuration = useFormatDuration();
  const now = new Date();
  const scope =
    snapshot.targetScope === "page"
      ? t("exactPage")
      : t("wholeSite", { included: String(snapshot.includeSubdomains) });
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-text">
        <GlobeSimple aria-hidden size={13} weight="regular" />
        {snapshot.target}
      </span>
      <span className="text-[12.5px] text-fg-muted">
        {scope} {t("snapshot")} {relativePastLabel(new Date(snapshot.fetchedAt), now, t)}
      </span>
      <span className="text-[12px] text-fg-muted">
        {t("source", {
          provider:
            snapshot.provider === "unknown"
              ? t("unknownSource")
              : (PROVIDER_CATALOG.find((provider) => provider.id === snapshot.provider)?.label ??
                snapshot.provider),
        })}
      </span>
      {storedFreshness ? (
        <StoredResultFreshness {...storedFreshness} />
      ) : snapshot.cachedUntil ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green-text">
          <Clock weight="regular" aria-hidden size={11} />
          {t("cached", {
            duration: formatDuration(Math.max(0, wholeSecondsRemaining(snapshot.cachedUntil, now))),
          })}
        </span>
      ) : null}
      {onRefresh ? (
        <button
          className="ml-auto cursor-pointer border-0 bg-transparent p-1 text-[12.5px] font-medium text-accent-text hover:text-accent-text focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
          disabled={refreshing}
          onClick={onRefresh}
          type="button"
        >
          {refreshing ? t("refreshing") : t("refresh")} {refreshPrice}
        </button>
      ) : null}
    </div>
  );
}
