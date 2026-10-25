"use client";
import { Disclosure } from "@/components/ui/Disclosure";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import type { AppLocale } from "@/i18n/config";
import type { SummaryDetails } from "@/lib/notifications/check-summaries/details-model";
import { formatCheckWindowLabel } from "@/lib/notifications/check-summaries/window-label";
import { appPath } from "@/lib/routing/app-path";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import Link from "next/link";
import { useLocale, useTimeZone, useTranslations } from "next-intl";

export function CheckSummaryDetails({
  details,
  projectRef,
  timeZone: zoneOverride,
}: Readonly<{
  details: SummaryDetails;
  projectRef: string;
  timeZone?: string;
}>) {
  const t = useTranslations("projectRuns.summary");
  const evidence = useTranslations("projectRankTracker.checks.evidence");
  const locale = useLocale() as AppLocale;
  const checks = useTranslations("projectRankTracker.checks");
  function marketLabel(value: string) {
    return value
      .split(" / ")
      .map((part) => {
        if (part === "desktop" || part === "mobile") return checks(part);
        if (/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(part)) {
          try {
            return new Intl.DisplayNames([locale], { type: "language" }).of(part) ?? part;
          } catch {
            return part;
          }
        }
        return part;
      })
      .join(" / ");
  }
  const browserZone = useBrowserTimeZone();
  const documentZone = useTimeZone();
  const timeZone = zoneOverride ?? browserZone ?? documentZone ?? "UTC";
  if (details.withdrawn)
    return (
      <section className="rounded-card border border-border bg-bg-elev p-4">
        <h1 className="m-0 text-ui-h1 font-semibold">{t("title")}</h1>
        <p className="mb-0 text-ui-body text-fg-muted">{t("withdrawn")}</p>
      </section>
    );
  function rows(values: SummaryDetails["rows"]) {
    return (
      <ul className="m-0 list-none divide-y divide-border-soft p-0">
        {values.map((row) => (
          <li
            key={row.checkId}
            className="flex min-w-0 flex-wrap items-start justify-between gap-2 px-4 py-3 text-ui-body"
          >
            <div className="min-w-0 flex-1">
              {row.available ? (
                <Link
                  className="break-words font-semibold text-accent-text"
                  href={appPath(projectRef, "rank-tracker", row.keywordPublicId)}
                >
                  {row.keyword}
                </Link>
              ) : (
                <span className="text-fg-muted">{t("unavailable")}</span>
              )}
              {row.available && row.market ? (
                <p className="m-0 mt-1 break-words text-ui-caption text-fg-muted">
                  {marketLabel(row.market)}
                </p>
              ) : null}
              {row.group === "failed" ? (
                <p className="m-0 mt-1 text-ui-caption text-fg-muted">
                  {row.projection?.result
                    ? t("classification", { classification: evidence(row.projection.result) })
                    : (row.deferredReason ?? t("failed"))}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 font-sans tabular-nums" aria-label={t("positions")}>
              {row.previous ?? "?"} →{" "}
              {row.group === "failed" || row.group === "under_review"
                ? t("noResult")
                : (row.current ?? "?")}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const quiet = details.rows.filter((row) => row.group === "unchanged" || row.group === "new");
  return (
    <section className="grid min-w-0 gap-3">
      <header className="flex flex-col items-start gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-ui-h1 font-semibold">{t("title")}</h1>
          <p className="mb-1 mt-2 break-words text-ui-body">
            {details.kind === "manual" ? (
              t("run", { run: details.runPublicId ?? "?" })
            ) : (
              <>
                {new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).formatRange(
                  new Date(details.windowStart),
                  new Date(details.windowEnd),
                )}{" "}
                ·{" "}
                {formatCheckWindowLabel({
                  start: details.windowStart,
                  end: details.windowEnd,
                  locale,
                  timeZone,
                })}
              </>
            )}
          </p>
          <p className="m-0 text-ui-caption text-fg-muted">
            {t("thresholds", {
              topN: String(details.topN),
              positionMove: String(details.positionMove),
            })}{" "}
            · {t("version", { version: String(details.version) })}
          </p>
        </div>
        <Link
          href={details.runsHref}
          className="inline-flex items-center gap-1 text-ui-caption font-semibold text-accent-text underline underline-offset-2"
        >
          {t("openRuns")}
          <ArrowSquareOutIcon aria-hidden size={13} />
        </Link>
      </header>
      {details.incidentHrefs.length ? (
        <nav className="flex flex-wrap gap-3 text-ui-caption">
          {details.incidentHrefs.map((href) => (
            <Link className="text-accent-text underline underline-offset-2" key={href} href={href}>
              {t("incident", { count: 1 })}
            </Link>
          ))}
        </nav>
      ) : null}
      {(["down", "up", "failed", "under_review"] as const).map((group) => {
        const values = details.rows.filter((row) => row.group === group);
        return values.length ? (
          <section
            key={group}
            className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
          >
            <h2 className="m-0 border-b border-border px-4 py-2.5 text-ui-body font-semibold">
              {t(group)} · {values.length}
            </h2>
            {rows(values)}
          </section>
        ) : null;
      })}
      {quiet.length ? (
        <Disclosure
          title={
            <span className="text-ui-body font-semibold">
              {t("quiet")} · {quiet.length}
            </span>
          }
          summaryClassName="px-4 py-2.5 sm:px-4"
          contentClassName="px-0 pb-0 sm:px-0"
        >
          {rows(quiet)}
        </Disclosure>
      ) : null}
    </section>
  );
}
