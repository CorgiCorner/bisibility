import { Card } from "@/components/ui/Card";
import type { MeasurementQuote, MeasurementTranslator, NativeEstimate } from "./contracts";
import { MeasurementScopeSummary } from "./MeasurementScopeSummary";

export function NativeEstimateRows({
  estimates,
  translate: t,
}: {
  estimates: readonly NativeEstimate[];
  translate: MeasurementTranslator;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-2 text-sm">
      {estimates.map((row, index) => (
        <li key={`${row.providerId}:${row.unit}:${index}`}>
          <span className="font-medium">{row.providerId}: </span>
          <span className="tabular-nums">
            {row.quantity === null
              ? t("amountUnknown")
              : `${row.quantity} ${t(`units.${row.unit}`)}`}
          </span>
          <span className="ml-2 text-fg-muted">
            {t(`certainty.${row.certainty}`, { count: row.unknownTargets })}
          </span>
        </li>
      ))}
    </ul>
  );
}
export function MeasurementQuoteReview({
  quote,
  translate: t,
  formatDate,
  formatCount,
}: {
  quote: MeasurementQuote;
  translate: MeasurementTranslator;
  formatDate: (iso: string, timezone?: string) => string;
  formatCount: (count: number) => string;
}) {
  return (
    <Card component="section" className="mt-4 min-w-0" aria-label={t("quoteReview")}>
      <h2 className="font-semibold">{t("quoteReview")}</h2>
      <p className="mt-2 text-sm tabular-nums">
        {t("counts", {
          keywords: formatCount(quote.run.keywordCount),
          targets: formatCount(quote.run.targetCount),
          eligible: formatCount(quote.run.executable),
        })}
      </p>
      {quote.run.overlapRunCount ? (
        <p className="mt-2 text-sm text-fg-muted">
          {t("overlaps", { count: formatCount(quote.run.overlapRunCount) })}
        </p>
      ) : null}
      {quote.run.excluded.length ? (
        <ul className="mt-3 text-sm text-fg-muted" aria-label={t("excludedTitle")}>
          {quote.run.excluded.map((row) => (
            <li key={`${row.keywordId}:${row.reason}`}>
              <span className="font-mono">{row.keywordId}</span>: {t(`excluded.${row.reason}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {quote.impact ? (
        <p className="mt-3 text-sm text-fg-muted">{t(`impact.${quote.impact.kind}`)}</p>
      ) : null}
      <div className="mt-4">
        <MeasurementScopeSummary evidence={quote.scope} translate={t} formatDate={formatDate} />
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        {t("intentScopeHelp", { count: formatCount(quote.intentEffect.inheritedDepthTargets) })}
      </p>
      {quote.intentEffect.recurringEstimate === "unknown" ? (
        <p className="mt-2 text-sm text-fg-muted">{t("intentForecastUnknown")}</p>
      ) : null}
      <h3 className="mt-4 text-sm font-semibold">{t("manualEstimate")}</h3>
      <NativeEstimateRows estimates={quote.manualEstimates} translate={t} />
      <p className="mt-2 text-sm text-fg-muted">{t("estimateHelp")}</p>
      {quote.calendar ? (
        <section className="mt-4">
          <h3 className="text-sm font-semibold">{t("scheduleForecast")}</h3>
          <p className="mt-2 text-sm">
            {t("calendarWindow", {
              start: formatDate(quote.calendar.windowStart, quote.calendar.timezone),
              end: formatDate(quote.calendar.windowEnd, quote.calendar.timezone),
              timezone: quote.calendar.timezone,
              count: formatCount(quote.calendar.dueOccurrences),
            })}
          </p>
          <p className="mt-2 text-sm">
            {quote.calendar.nextRunAt
              ? t("nextRun", {
                  time: formatDate(quote.calendar.nextRunAt, quote.calendar.timezone),
                  timezone: quote.calendar.timezone,
                })
              : t("nextRunUnknown")}
          </p>
          {quote.calendar.targetScope ? (
            <p className="mt-2 text-sm text-fg-muted">
              {t("scheduleScope", {
                keywords: formatCount(quote.calendar.targetScope.keywordCount),
                targets: formatCount(quote.calendar.targetScope.targetCount),
                locations: formatCount(quote.calendar.targetScope.locationCount),
                languages: formatCount(quote.calendar.targetScope.languageCount),
                devices: formatCount(quote.calendar.targetScope.deviceCount),
              })}
            </p>
          ) : null}
          <NativeEstimateRows estimates={quote.calendar.recurringEstimates} translate={t} />
        </section>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">{t("noScheduleForecast")}</p>
      )}
      <p className="mt-4 text-sm text-fg-muted">
        {t("quoteExpires", { expiry: formatDate(quote.run.expiresAt) })}
      </p>
      <p className="mt-2 text-sm text-fg-muted">{t("budgetRecheck")}</p>
    </Card>
  );
}
