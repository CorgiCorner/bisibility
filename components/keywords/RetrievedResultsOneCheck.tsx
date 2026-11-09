"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState as EmptyPanel } from "@/components/ui/EmptyState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { RetrievedResults } from "@/lib/checks/contract";
import { featureChips } from "@/lib/checks/retrieved-results-model";
import type { TrackedCompetitor } from "@/lib/competitors/serp-comparison";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { RetrievedAiOverview } from "./RetrievedAiOverview";
import { RetrievedResultsLadder } from "./RetrievedResultsLadder";

type Props = {
  competitors?: readonly TrackedCompetitor[];
  rankingUrl: string | null;
  results: RetrievedResults;
  retentionDays: number | null;
  formatDate: (iso: string) => string;
};

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </span>
  );
}

function FeatureRow({ features }: Readonly<{ features: readonly string[] }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const chips = featureChips(features);
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5"
      data-testid="retrieved-features"
    >
      <Eyebrow>{t("onPage")}</Eyebrow>
      {chips.map((chip) => (
        <Tooltip
          content={chip.known ? t(`features.${chip.known}.description`) : chip.raw}
          key={chip.raw}
          semantics="description"
        >
          <span className="rounded-full border border-border px-2.5 py-1 font-sans tabular-nums text-[10.5px] text-fg">
            {chip.known ? t(`features.${chip.known}.label`) : chip.raw}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function EmptyState({
  results,
  formatDate,
}: Readonly<{
  results: Extract<RetrievedResults, { tier: "none" }>;
  formatDate: (iso: string) => string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  return (
    <div className="m-4 rounded-control border border-dashed border-border bg-bg-sunken p-4">
      <p className="m-0 text-[13px] font-semibold text-fg">{t("noStoredTitle")}</p>
      <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">
        {t("noStoredDescription", { date: formatDate(results.checkedAt) })}
      </p>
    </div>
  );
}

function CompactState({
  results,
}: Readonly<{ results: Extract<RetrievedResults, { tier: "compact" }> }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  if (!results.domains.length)
    return (
      <EmptyPanel
        compact
        icon={<MagnifyingGlassIcon size={20} aria-hidden />}
        title={t("fullResultsMissing")}
        description={t("fullResultsMissingHelp")}
      />
    );
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center gap-1 text-[12.5px] text-fg-muted">
        <span>{t("compactSummary")}</span>
      </div>
      <ul className="m-0 mt-3 list-none p-0">
        {results.domains.map((entry) => (
          <li
            className="flex justify-between border-b border-border py-2 text-[12.5px]"
            key={entry.domain}
          >
            <span>{entry.domain}</span>
            <span className="font-sans tabular-nums text-fg-muted">
              {t("position", { position: entry.bestPosition })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RetainedUrl({ url }: Readonly<{ url: string | null }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  return url ? (
    <p
      data-testid="retrieved-retained-url"
      className="m-0 truncate border-b border-border px-4 py-3 text-[12px] text-fg-muted sm:px-5"
      title={url}
    >
      {t("yourResult")}: {url}
    </p>
  ) : null;
}

export function RetrievedResultsOneCheck({
  competitors = [],
  rankingUrl,
  results,
  retentionDays,
  formatDate,
}: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const trackedRef = useRef<HTMLLIElement | null>(null);
  if (results.tier === "none")
    return (
      <div>
        <RetainedUrl url={rankingUrl} />
        <EmptyState formatDate={formatDate} results={results} />
      </div>
    );
  if (results.tier === "compact")
    return (
      <div>
        <RetainedUrl url={rankingUrl} />
        <CompactState results={results} />
      </div>
    );
  const url = rankingUrl;
  const coverageDepth = Math.min(20, results.requestedDepth ?? 0);
  const savedPositions = new Set(
    results.rows
      .filter((row) => row.position >= 1 && row.position <= coverageDepth)
      .map((row) => row.position),
  );
  const missing = Array.from({ length: coverageDepth }, (_, index) => index + 1).filter(
    (rank) => !savedPositions.has(rank),
  );
  const strongWarning =
    missing.length >= Math.max(3, Math.ceil(coverageDepth / 4)) ||
    missing.some((rank) => results.trackedPosition !== null && rank < results.trackedPosition);
  return (
    <div>
      <FeatureRow
        features={results.features.filter(
          (feature) =>
            !["ai overview", "local pack", "local results", "places results"].includes(
              feature.toLowerCase().replaceAll("_", " "),
            ),
        )}
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5"
        data-testid="retrieved-summary"
      >
        <Eyebrow>{t("yourResult")}</Eyebrow>
        <strong className="font-sans tabular-nums text-[14px] text-fg">
          {results.trackedPosition === null
            ? results.observationCompleteness === "unknown" ||
              results.observationCompleteness === "truncated_by_stop_on_match"
              ? t("resultIndeterminate")
              : t("notFound")
            : t("position", { position: results.trackedPosition })}
        </strong>
        {results.requestedDepth ? (
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            {t("savedResults", {
              depth: results.requestedDepth,
              count: results.rows.length,
            })}
          </span>
        ) : null}
        {url ? (
          <span
            className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted"
            title={url}
          >
            {url}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {results.trackedPosition !== null ? (
          <Button
            onClick={() =>
              trackedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            size="xs"
            variant="secondary"
          >
            <ArrowDown aria-hidden size={13} weight="regular" />
            {t("jumpToResult")}
          </Button>
        ) : null}
        {missing.length > 0 ? (
          <InfoTooltip
            text={`${t("missingPositions", { count: missing.length, depth: coverageDepth, ranks: missing.map((rank) => `#${rank}`).join(", ") })}${strongWarning ? ` ${t("partialCompetitors", { depth: coverageDepth })}` : ""}`}
          />
        ) : null}
      </div>
      {results.aiOverview === null ? (
        <p className="m-0 border-b border-border px-5 py-2 text-[12px] text-fg-muted">
          {t("aiUnknown")}
        </p>
      ) : null}
      <RetrievedAiOverview results={results} />
      <RetrievedResultsLadder competitors={competitors} results={results} trackedRef={trackedRef} />
      <p className="m-0 flex items-center gap-1.5 border-t border-border px-4 py-3 text-[12px] text-fg-muted sm:px-5">
        {results.fullDetailUntil === null
          ? t("selfHostedRetention")
          : t("hostedRetention", { days: retentionDays ?? 0 })}
        <InfoTooltip text={t("retentionTip")} />
      </p>
    </div>
  );
}
