"use client";
import { Button } from "@/components/ui/Button";
import type { SerpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { useFormatter, useTranslations } from "next-intl";
export function LocalPackDetails({ local }: { local: SerpFeaturePresentation["localPack"] }) {
  const t = useTranslations("projectRankTracker.keywordDetail.results"),
    format = useFormatter();
  return local.places.length ? (
    <ol className="m-0 list-none divide-y divide-border p-0">
      {local.places.map((place, index) => (
        <li
          key={index}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-5 first:pt-0 last:pb-0"
        >
          <span className="pt-0.5 text-sm tabular-nums text-fg-muted">
            {place.position ?? index + 1}
          </span>
          <div className="min-w-0 space-y-3">
            <h3 className="m-0 text-base font-semibold">{place.name}</h3>
            {place.rating !== undefined ? (
              <p className="m-0 flex items-center gap-2 text-sm">
                <StarIcon size={16} aria-hidden />
                {format.number(place.rating, { maximumFractionDigits: 1 })}
                {place.reviewCount !== undefined ? (
                  <span className="text-fg-muted">({format.number(place.reviewCount)})</span>
                ) : null}
              </p>
            ) : null}
            {place.description ? (
              <p className="m-0 whitespace-pre-line text-sm leading-6 text-fg-muted">
                {place.description}
              </p>
            ) : null}
            {place.url ? (
              <div className="pt-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  startIcon={<MapPinIcon size={16} aria-hidden />}
                >
                  <a href={place.url} target="_blank" rel="noreferrer noopener">
                    {t("openMap")}
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="m-0 text-sm text-fg-muted">{t("localContentNotStored")}</p>
  );
}
