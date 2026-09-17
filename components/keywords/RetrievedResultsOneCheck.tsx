"use client";

import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { RetrievedResults } from "@/lib/checks/contract";
import { featureChips } from "@/lib/checks/retrieved-results-model";
import type { TrackedCompetitor } from "@/lib/competitors/serp-comparison";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { useTranslations } from "next-intl";
import { useRef } from "react";
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
  return (
    <div className="p-4 sm:p-5">
      <p className="m-0 text-[12.5px] leading-5 text-fg-muted">{t("compactDescription")}</p>
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
      <p className="m-0 mt-3 text-[12px] text-fg-muted">{t("compactComparison")}</p>
    </div>
  );
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
  if (results.tier === "none") return <EmptyState formatDate={formatDate} results={results} />;
  if (results.tier === "compact") return <CompactState results={results} />;
  const url = rankingUrl ?? results.rows.find((row) => row.tracked)?.url;
  return (
    <div>
      <FeatureRow features={results.features} />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5"
        data-testid="retrieved-summary"
      >
        <Eyebrow>{t("yourResult")}</Eyebrow>
        <strong className="font-sans tabular-nums text-[14px] text-fg">
          {results.trackedPosition === null
            ? t("notFound")
            : t("position", { position: results.trackedPosition })}
        </strong>
        {url ? (
          <span className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
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
      </div>
      {results.aiOverview === null ? (
        <p className="m-0 border-b border-border px-5 py-2 text-[12px] text-fg-muted">
          {t("aiUnknown")}
        </p>
      ) : null}
      {results.aiOverview ? (
        <p className="m-0 border-b border-border px-5 py-2 text-[12px] text-fg-muted">
          {t("aiPresent")}
        </p>
      ) : null}
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
