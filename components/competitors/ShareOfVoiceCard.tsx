import { Card, MonoText, SectionTitle } from "@/components/ui";
import type { CompetitorFilter, CompetitorKind, CompetitorMarket } from "@/lib/competitors/types";
import { countLabel } from "@/lib/format/pluralize";
import { InfoIcon as Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { CompetitorFilterControls } from "./CompetitorFilterControls";
import { CompetitorTile } from "./CompetitorTile";
import { ManagedCompetitorControls } from "./ManagedCompetitorControls";

type ShareOfVoiceCardProps = {
  canDelete: boolean;
  canUpdate: boolean;
  filter: CompetitorFilter;
  market: CompetitorMarket;
  onFilterChange: (filter: CompetitorFilter) => void;
  projectId: string;
  scopeControls?: ReactNode;
};

const kindStyles = {
  You: { color: "var(--accent-text)", background: "var(--accent-soft)" },
  Managed: {
    color: "var(--blue)",
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
  },
} satisfies Record<CompetitorKind, { color: string; background: string }>;

export function ShareOfVoiceCard({
  canDelete,
  canUpdate,
  filter,
  market,
  onFilterChange,
  projectId,
  scopeControls,
}: Readonly<ShareOfVoiceCardProps>) {
  const maxShare = Math.max(1, ...market.shares.map((competitor) => competitor.shareOfVoice));
  const emptyCopy = {
    completed_unranked:
      "Rank checks have completed for this market, but no tracked domain ranked in the top 100.",
    filter_excludes_all:
      "No completed rank checks match the current filters. Adjust the filters to view available market data.",
    no_volume_data:
      "No positive search volume is available for the compared keywords. Head-to-head ranks remain available below.",
    no_completed_checks:
      "No completed rank checks exist for this market yet. Run a check to calculate share of voice from real positions.",
    ranked: null,
  }[market.dataState];

  return (
    <Card className="px-5 py-[18px]" size="md">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionTitle>Share of voice</SectionTitle>
          <MonoText muted>
            Visibility across {countLabel(market.trackedKeywordCount, "tracked keyword")} / Google
            {" / "}
            {market.location} / {market.languageLabel} /{" "}
            {market.device === "mobile" ? "Mobile" : "Desktop"}
            {market.checkedKeywordCount < market.trackedKeywordCount ? " · Partial data" : ""}
          </MonoText>
        </div>
        <CompetitorFilterControls
          filter={filter}
          onFilterChange={onFilterChange}
          tags={market.tags}
        />
      </div>

      {scopeControls ? <div className="mt-3.5">{scopeControls}</div> : null}

      {emptyCopy ? (
        <div className="mt-[18px] rounded-[11px] border border-dashed border-border-strong bg-transparent px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
          {emptyCopy}
        </div>
      ) : null}

      {market.dataState === "ranked" ? (
        <div className="mt-[18px] flex flex-col gap-[13px]">
          {market.shares.map((competitor) => {
            const kind = kindStyles[competitor.kind];
            const barWidth = `${Math.round((competitor.shareOfVoice / maxShare) * 100)}%`;
            const managed =
              competitor.id && competitor.kind === "Managed"
                ? {
                    domain: competitor.domain,
                    id: competitor.id,
                    initials: competitor.initials,
                    label: competitor.label,
                  }
                : null;

            return (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap"
                key={competitor.id ?? competitor.domain}
              >
                <CompetitorTile domain={competitor.domain} initials={competitor.initials} />
                <span className="flex min-w-0 flex-1 items-center gap-[7px] sm:w-[190px] sm:flex-none">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">
                      {competitor.label}
                    </span>
                    {competitor.kind === "Managed" ? (
                      <a
                        className="block truncate font-mono text-[10px] text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text"
                        href={`https://${competitor.domain}`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {competitor.domain}
                      </a>
                    ) : competitor.label !== competitor.domain ? (
                      <span className="block truncate font-mono text-[10px] text-fg-muted">
                        {competitor.domain}
                      </span>
                    ) : null}
                  </span>
                  {competitor.kind === "You" ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase"
                      style={{ backgroundColor: kind.background, color: kind.color }}
                    >
                      You
                    </span>
                  ) : null}
                </span>
                <span className="h-2.5 min-w-[160px] flex-1 overflow-hidden rounded-full bg-bg-sunken">
                  <span
                    aria-hidden
                    className="block h-full rounded-full"
                    style={{ backgroundColor: competitor.color, width: barWidth }}
                  />
                </span>
                <span className="w-full text-right font-mono text-xs text-fg-muted sm:w-[130px]">
                  {competitor.sharedKeywords} kw · {competitor.shareOfVoice}%
                </span>
                {managed ? (
                  <ManagedCompetitorControls
                    canDelete={canDelete}
                    canUpdate={canUpdate}
                    competitor={managed}
                    projectId={projectId}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="m-0 mt-4 flex items-center gap-2 border-border-soft border-t pt-3.5 text-[11.5px] text-fg-muted">
        <Info aria-hidden className="shrink-0 text-accent-text" size={14} />
        SOV = share of estimated top-10 visibility (rank x search volume).
      </p>
    </Card>
  );
}
