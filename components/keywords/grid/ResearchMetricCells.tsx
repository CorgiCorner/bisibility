"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { ResearchDifficultyPill } from "@/components/keywords/saved/saved-keywords-table-columns";
import { chronologicalTrend, IntentChip } from "@/components/research/research-results-model";
import { Tooltip } from "@/components/ui/Tooltip";
import type { TrackedResearchMetrics } from "@/lib/keyword-research/tracked-research";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { NoDataValue } from "./market-grid-cells";

type Props = { research: TrackedResearchMetrics | null | undefined; mixed?: boolean };
function Empty({ mixed }: Readonly<{ mixed?: boolean }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const market = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  return mixed ? <span>{market("mixed")}</span> : <NoDataValue label={t("noResearchData")} />;
}
export function ResearchVolumeCell({ research, mixed }: Readonly<Props>) {
  const format = useFormatter();
  return research?.volume == null ? (
    <Empty mixed={mixed} />
  ) : (
    <span>{format.number(research.volume)}</span>
  );
}
export function ResearchDifficultyCell({ research, mixed }: Readonly<Props>) {
  if (research?.difficulty == null) return <Empty mixed={mixed} />;
  return <ResearchDifficultyPill value={research.difficulty} />;
}
export function ResearchCpcCell({ research, mixed }: Readonly<Props>) {
  const format = useFormatter();
  return research?.cpc == null ? (
    <Empty mixed={mixed} />
  ) : (
    <span>{format.number(research.cpc, { currency: "USD", style: "currency" })}</span>
  );
}
export function ResearchIntentCell({ research, mixed }: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const intent = research?.intent;
  if (!intent || intent === "unknown") return <Empty mixed={mixed} />;
  const label =
    intent === "commercial"
      ? t("intentCommercial")
      : intent === "informational"
        ? t("intentInformational")
        : intent === "navigational"
          ? t("intentNavigational")
          : t("intentTransactional");
  return <IntentChip intent={intent} label={label} />;
}
export function ResearchTrendCell({
  research,
  mixed,
  keyword,
}: Readonly<Props & { keyword: string }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  return research?.trend.length ? (
    <Sparkline
      ariaLabel={t("volumeTrend", { keyword })}
      data={chronologicalTrend(research.trend).map((point) => point.searchVolume)}
    />
  ) : (
    <Empty mixed={mixed} />
  );
}
export function ResearchSourceCell({
  research,
  mixed,
  projectRef,
  location,
}: Readonly<Props & { projectRef: string; location: string }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const format = useFormatter();
  if (!research) return <Empty mixed={mixed} />;
  const params = new URLSearchParams({ seed: research.sourceSeed, location });
  return (
    <Tooltip
      content={t("researchSnapshotAt", {
        date: format.dateTime(new Date(research.fetchedAt), { dateStyle: "medium" }),
      })}
      semantics="description"
    >
      <Link
        className="truncate"
        href={`${appPath(projectRef, "keyword-research")}?${params}`}
        onClick={(event) => event.stopPropagation()}
      >
        {research.sourceSeed}
      </Link>
    </Tooltip>
  );
}
export function ResearchDateCell({ research, mixed }: Readonly<Props>) {
  const format = useFormatter();
  return research ? (
    <span>{format.dateTime(new Date(research.fetchedAt), { dateStyle: "medium" })}</span>
  ) : (
    <Empty mixed={mixed} />
  );
}
