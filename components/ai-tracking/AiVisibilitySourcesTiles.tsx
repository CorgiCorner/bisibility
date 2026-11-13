"use client";

import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import type { AiVisibilitySources } from "@/lib/ai-tracking/sources-model";
import { useFormatter, useTranslations } from "next-intl";

const pills = [
  "all",
  "directory",
  "competitor",
  "community",
  "reviews",
  "editorial",
  "unsorted",
] as const;

export type SourcePill = (typeof pills)[number];

function pillCount(sources: AiVisibilitySources, pill: SourcePill) {
  if (pill === "all") return sources.rows.length;
  return sources.rows.filter((row) => row.type === pill).length;
}

export function activeSourcePill(sources: AiVisibilitySources, pill: SourcePill): SourcePill {
  if (pill === "all" || sources.rows.some((row) => row.type === pill)) return pill;
  return "all";
}

export function sourcePillRows(
  rows: readonly AiVisibilitySources["rows"][number][],
  pill: SourcePill,
) {
  if (pill === "all") return rows;
  return rows.filter((row) => row.type === pill);
}

export function AiVisibilitySourcesTiles({
  onPill,
  pill,
  sources,
}: Readonly<{
  onPill: (pill: SourcePill) => void;
  pill: SourcePill;
  sources: AiVisibilitySources;
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const visible = pills.filter((item) => item === "all" || pillCount(sources, item) > 0);
  const selected = visible.includes(pill) ? pill : "all";
  const yourSite = sources.yourSite;
  const yourSiteDetail =
    yourSite.links === 0
      ? t("sources.tileYourSiteNone")
      : yourSite.allNamed
        ? t("sources.tileYourSiteAll", { links: yourSite.links })
        : t("sources.tileYourSiteMixed", { links: yourSite.links, unnamed: yourSite.unnamedLinks });
  const labels: Record<SourcePill, string> = {
    all: t("sources.type.all"),
    community: t("sources.type.community"),
    competitor: t("sources.type.competitors"),
    directory: t("sources.type.directories"),
    editorial: t("sources.type.editorial"),
    reviews: t("sources.type.reviews"),
    unsorted: t("sources.type.unsorted"),
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          caption={t("sources.tileCitedDetail", {
            answers: sources.totalAnswers,
            domains: sources.citedDomains,
          })}
          label={t("sources.tileCited")}
          value={format.number(sources.citedDomains)}
        />
        <StatTile
          caption={yourSiteDetail}
          label={t("sources.tileYourSite")}
          value={format.number(yourSite.links)}
        />
        <StatTile
          caption={t("sources.tileWithoutDomains", { domains: sources.unnamedOtherDomains })}
          label={t("sources.tileWithout")}
          value={t("sources.tileWithoutLinks", { links: sources.withoutNameLinks })}
        />
      </div>
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">{t("sources.typeFilter")}</legend>
        {visible.map((item) => (
          <Button
            aria-pressed={item === selected}
            key={item}
            onClick={() => onPill(item)}
            size="sm"
            type="button"
            variant={item === selected ? "primary" : "secondary"}
          >
            {labels[item]} {format.number(pillCount(sources, item))}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
