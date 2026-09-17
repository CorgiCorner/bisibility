import {
  StoredResultFreshness,
  type StoredResultFreshness as StoredResultFreshnessData,
} from "@/components/demo-research/StoredResultFreshness";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import { relativePastFact } from "@/lib/format/relative-time";
import { ClockIcon as Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { GlobeSimpleIcon as GlobeSimple } from "@phosphor-icons/react/dist/csr/GlobeSimple";
import { useFormatter, useTranslations } from "next-intl";

type BacklinksSnapshotMetaProps = {
  estimateCents: number | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  snapshot: Omit<BacklinksSnapshot, "cachedUntil"> & { cachedUntil?: string };
  storedFreshness?: StoredResultFreshnessData;
};

function cacheHours(cachedUntil: string, now: Date) {
  const hours = Math.max(
    0,
    Math.ceil((new Date(cachedUntil).getTime() - now.getTime()) / 3_600_000),
  );
  return hours;
}

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

function refreshEstimateLabel(
  estimateCents: number,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectBacklinks.workspace.snapshot">>,
) {
  const currency = (value: number) =>
    format.number(value, {
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
  const absoluteCents = Math.abs(estimateCents);
  if (absoluteCents > 0 && absoluteCents < 1) {
    return t("refreshEstimateUnderCent", {
      amount: currency(0.01),
      sign: estimateCents < 0 ? "-" : "",
    });
  }
  return t("refreshEstimate", { amount: currency(estimateCents / 100) });
}

export function BacklinksSnapshotMeta({
  estimateCents,
  onRefresh,
  refreshing,
  snapshot,
  storedFreshness,
}: Readonly<BacklinksSnapshotMetaProps>) {
  const format = useFormatter();
  const t = useTranslations("projectBacklinks.workspace.snapshot");
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
      {storedFreshness ? (
        <StoredResultFreshness {...storedFreshness} />
      ) : snapshot.cachedUntil ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green-text">
          <Clock weight="regular" aria-hidden size={11} />
          {t("cached", { hours: cacheHours(snapshot.cachedUntil, now) })}
        </span>
      ) : null}
      {onRefresh ? (
        <button
          className="ml-auto cursor-pointer border-0 bg-transparent p-1 text-[12.5px] font-medium text-accent-text hover:text-accent-text focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
          disabled={refreshing}
          onClick={onRefresh}
          type="button"
        >
          {refreshing ? t("refreshing") : t("refresh")}{" "}
          {estimateCents == null ? null : (
            <span className="font-sans tabular-nums">
              {refreshEstimateLabel(estimateCents, format, t)}
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}
