"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import type { DefaultsPreview } from "@/lib/settings/reviewed-defaults-contract";
import { useFormatter, useTranslations } from "next-intl";
export function ReviewedDefaultsPanel({
  quote,
  acknowledged,
  onAcknowledged,
  locked,
}: Readonly<{
  quote: DefaultsPreview | null;
  acknowledged: boolean;
  onAcknowledged: (value: boolean) => void;
  locked: boolean;
}>) {
  const t = useTranslations("shared.reviewedDefaults"),
    tracking = useTranslations("projectSettingsTracking.checkDefaults"),
    format = useFormatter();
  if (!quote) return null;
  const v = quote.draft;
  const frequency = {
    daily: tracking("frequencyDaily"),
    weekly: tracking("frequencyWeekly"),
    monthly: tracking("frequencyMonthly"),
    manual: tracking("frequencyManual"),
    paused: tracking("frequencyPaused"),
    custom_cron: tracking("frequencyCustomCron"),
  }[v.frequency];
  return (
    <section className="mt-4 rounded-control border border-border p-3" aria-label={t("title")}>
      <h3 className="m-0 text-sm font-semibold">{t("title")}</h3>
      <p className="mt-2 text-sm">
        {t("scope", {
          place: quote.resolved.label,
          language: quote.resolved.languageCode,
          device:
            quote.resolved.device === "mobile"
              ? tracking("deviceMobile")
              : tracking("deviceDesktop"),
          depth: format.number(v.serpDepth ?? 100),
        })}
      </p>
      <p className="mt-2 text-sm">
        {t("cadence", {
          frequency,
          timezone: v.timezone,
          cron: v.cronExpression ?? "",
          jitter: format.number(v.jitterMinutes),
        })}
      </p>
      <p className="mt-2 text-sm">{t(v.serpStopOnMatch ? "stopAtMatch" : "scanFullDepth")}</p>
      <p className="mt-2 text-sm text-fg-muted">
        {t("impact", { count: format.number(quote.impact.inheritedDepthTargets) })}
      </p>
      <p className="mt-2 text-sm text-fg-muted">
        {t(quote.impact.recurringEstimate === "unknown" ? "estimateUnknown" : "estimateUnchanged")}
      </p>
      {!quote.policyReady ? (
        <p className="mt-2 text-sm text-fg-muted">{t("policyUnknown")}</p>
      ) : null}
      <p className="mt-2 text-sm text-fg-muted">
        {t("expiry", {
          time: format.dateTime(new Date(quote.expiresAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })}
      </p>
      <Checkbox
        containerClassName="mt-3"
        checked={acknowledged}
        disabled={locked}
        label={t("consent")}
        onChange={(event) => onAcknowledged(event.currentTarget.checked)}
      />
      {locked ? (
        <p className="mt-2 text-sm" role="status">
          {t("recover")}
        </p>
      ) : null}
    </section>
  );
}
