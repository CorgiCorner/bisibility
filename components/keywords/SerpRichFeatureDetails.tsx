"use client";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RichSerpFeature, RichSerpItem } from "@/lib/checks/serp-rich-features";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";

function PreviewImage({ item, gallery }: { item: RichSerpItem; gallery?: boolean }) {
  return item.imageUrl ? (
    <div
      className={`relative overflow-hidden rounded-control bg-bg-sunken ${gallery ? "aspect-[4/3]" : "aspect-square"}`}
    >
      <Image
        src={item.imageUrl}
        alt={item.title}
        fill
        unoptimized
        referrerPolicy="no-referrer"
        sizes="(max-width: 640px) 40vw, 220px"
        className={gallery ? "object-cover" : "object-contain p-3"}
      />
    </div>
  ) : null;
}
function ItemCopy({ item }: { item: RichSerpItem }) {
  const format = useFormatter();
  const price =
    item.price ??
    (item.priceAmount === undefined
      ? undefined
      : format.number(
          item.priceAmount,
          item.priceCurrency ? { style: "currency", currency: item.priceCurrency } : {},
        ));
  return (
    <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
      {item.source ? <p className="m-0 text-xs text-fg-muted">{item.source}</p> : null}
      {item.title ? (
        <h3 className="m-0 text-base font-medium leading-6">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline underline-offset-4"
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h3>
      ) : null}
      {item.text ? (
        <p className="m-0 whitespace-pre-line text-sm leading-6 text-fg-muted">{item.text}</p>
      ) : null}
      {price ? <p className="m-0 text-base font-semibold">{price}</p> : null}
      {item.rating !== undefined ? (
        <p className="m-0 flex items-center gap-1.5 text-xs text-fg-muted">
          <StarIcon size={14} weight="regular" aria-hidden />
          {format.number(item.rating, { maximumFractionDigits: 1 })}
          {item.reviewCount !== undefined ? <span>({format.number(item.reviewCount)})</span> : null}
        </p>
      ) : null}
      {item.facts?.length ? (
        <dl className="m-0 grid gap-2 pt-2">
          {item.facts.map((fact, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 text-sm">
              <dt className="text-fg-muted">{fact.label}</dt>
              <dd className="m-0">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
export function SerpRichFeatureDetails({ feature }: { feature: RichSerpFeature }) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  if (!feature.items.length)
    return (
      <EmptyState
        compact
        title={t("featureContentMissing")}
        description={t("featureContentMissingHelp")}
      />
    );
  const gallery = feature.kind === "images",
    tiles = gallery || feature.kind === "shopping";
  return (
    <ul
      className={
        tiles
          ? `m-0 grid list-none grid-cols-2 gap-4 p-0 ${feature.items.length > 2 ? "sm:grid-cols-3" : ""}`
          : "m-0 list-none divide-y divide-border-soft p-0"
      }
    >
      {feature.items.map((item, index) => (
        <li
          key={index}
          className={tiles ? "min-w-0 space-y-3" : "min-w-0 space-y-4 py-5 first:pt-0 last:pb-0"}
        >
          {tiles ? (
            <>
              <PreviewImage item={item} gallery={gallery} />
              <ItemCopy item={item} />
            </>
          ) : (
            <div
              className={
                item.imageUrl
                  ? "grid grid-cols-[minmax(0,1fr)_5rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]"
                  : "min-w-0"
              }
            >
              <ItemCopy item={item} />
              <PreviewImage item={item} />
            </div>
          )}
          {item.url && !item.title ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              endIcon={<ArrowUpRightIcon weight="regular" size={14} aria-hidden />}
            >
              <a href={item.url} target="_blank" rel="noreferrer noopener">
                {t("openFeatureResult")}
              </a>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
