"use client";

import { BrandLockup } from "@/components/ui/BrandLockup";
import { DomainIconLayer } from "@/components/ui/DomainIconLayer";
import { reportCardContent } from "@/lib/report-sharing/card-content";
import type { PublicReport } from "@/lib/report-sharing/projection";
import { buildPublicDomainIconUrl } from "@/lib/ui/domain-icon-url";
import { useLocale, useTimeZone, useTranslations } from "next-intl";

export function ReportCardPreview({
  domain,
  faviconDomain,
  title,
  view,
}: Readonly<{ domain: string; faviconDomain?: string | null; title: string; view: PublicReport }>) {
  const t = useTranslations("challengeReport");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "UTC";
  const { copy, labels } = reportCardContent({ domain, title, view }, t, locale, timeZone);
  const { comparison, clickTrend } = copy;
  const showTrend = clickTrend && clickTrend.filter((point) => point !== null).length > 1;
  const max = Math.max(1, ...(clickTrend ?? []).map((point) => point ?? 0));
  return (
    <div className="grid min-w-0 gap-4 text-fg" data-report-card-preview>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-control bg-bg-sunken text-ui-body font-semibold"
          >
            {domain.trim().charAt(0).toUpperCase()}
            <DomainIconLayer src={buildPublicDomainIconUrl({ domain: faviconDomain })} />
          </span>
          <div className="min-w-0">
            <p className="m-0 wrap-anywhere text-ui-body font-semibold">{domain}</p>
            <p className="m-0 text-ui-caption text-fg-muted">{labels.day}</p>
          </div>
        </div>
        <BrandLockup className="shrink-0" size="sm" />
      </div>
      <div className="grid min-w-0 gap-3 border-t border-border-soft pt-4">
        {labels.headline ? (
          <p className="m-0 text-ui-body font-semibold">{labels.headline}</p>
        ) : null}
        {comparison && labels.comparison ? (
          <dl className="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
            <div className="flex flex-col-reverse gap-1">
              <dt className="text-ui-caption text-fg-muted">{labels.comparison.start}</dt>
              <dd className="m-0 text-ui-h1 tabular-nums">{comparison.start}</dd>
            </div>
            <div className="relative flex flex-col-reverse gap-1 pl-7">
              <dt className="text-ui-caption text-fg-muted">{labels.comparison.latest}</dt>
              <dd className="m-0 text-ui-h1 tabular-nums">
                <span aria-hidden className="absolute left-0 top-0 text-fg-muted">
                  →
                </span>
                {comparison.latest}
              </dd>
            </div>
            <div className="text-ui-caption text-fg-muted">
              <dt className="sr-only">{t("card.change")}</dt>
              <dd className="m-0">{labels.comparison.change}</dd>
            </div>
          </dl>
        ) : (
          <div className="grid min-w-0 gap-2">
            <p className="m-0 wrap-anywhere text-ui-h1 tabular-nums">{copy.headline}</p>
            {labels.detail ? (
              <p className="m-0 text-ui-caption text-fg-muted">{labels.detail}</p>
            ) : null}
          </div>
        )}
        {showTrend ? (
          <figure className="m-0 grid gap-1">
            <div aria-hidden className="flex h-10 items-end gap-px border-b border-border-soft">
              {clickTrend.map((point, index) => (
                <span
                  className="flex-1 rounded-t-sm bg-green"
                  key={index}
                  style={{ height: point === null ? 0 : `${Math.max(2, (100 * point) / max)}%` }}
                />
              ))}
            </div>
            <figcaption className="text-ui-caption text-fg-muted">{labels.clickTrend}</figcaption>
          </figure>
        ) : null}
      </div>
      {copy.facts.length ? (
        <dl className="m-0 grid gap-3 border-t border-border-soft pt-3 sm:grid-cols-3">
          {copy.facts.map(({ label, value }) => (
            <div className="flex min-w-0 flex-col-reverse gap-1" key={label}>
              <dt className="text-ui-caption text-fg-muted">{labels.facts[label]}</dt>
              <dd className="m-0 wrap-anywhere text-ui-section tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
