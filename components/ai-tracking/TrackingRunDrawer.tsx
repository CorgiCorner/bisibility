"use client";
import { PaymentQuoteSummary } from "@/components/action-payment/PaymentQuoteSummary";
import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import type { TrackingPreview } from "@/lib/ai-tracking/projections/workspace";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import type { TrackingRunDrawerProps } from "./TrackingRunDrawer.types";
import { TrackingSavedConfiguration } from "./TrackingSavedConfiguration";
import { TrackingSourceControls } from "./TrackingSourceControls";
import { trackingEngines, trackingRunConfigurations } from "./tracking-run-configuration";

export type { TrackingPreview } from "@/lib/ai-tracking/projections/workspace";
export function TrackingRunDrawer({
  open,
  count,
  onClose,
  onPreview,
  onLaunch,
  pending,
  schedule,
  scheduleMode = false,
  onCatalog,
  mutationError,
  onSaveMetadata,
}: Readonly<TrackingRunDrawerProps>) {
  const locale = useLocale();
  const paymentT = useTranslations("shared.actionPayment");
  const t = useTranslations("projectAiTracking");
  const [previewPending, startPreview] = useTransition();
  const [replaceConfiguration, setReplaceConfiguration] = useState(false);
  const saved = schedule?.configurations?.[0];
  const reviewing = !schedule || replaceConfiguration;
  const version = useRef(0);
  const busy = pending || previewPending;
  const [preview, setPreview] = useState<TrackingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, control, watch, handleSubmit, setValue } = useForm<
    z.infer<typeof trackingConfigurationForm>
  >({
    resolver: zodResolver(trackingConfigurationForm),
    defaultValues: {
      source: saved?.source ?? "consumer_scrape",
      engine: saved?.engine ?? "chat_gpt",
      locale: String(saved?.parameters.language_code ?? "en"),
      location: String(saved?.parameters.location_name ?? "United States"),
      model: saved?.model ?? "",
      consent: false,
      scheduleName: schedule?.name ?? "Weekly AI tracking",
      cron: schedule?.cron ?? "0 9 * * 1",
      timezone: schedule?.timezone ?? "UTC",
      enabled: schedule?.enabled ?? false,
    },
  });
  const source = watch("source");
  const [launchUnconfirmed, setLaunchUnconfirmed] = useState(false);
  const expired = usePaymentQuoteExpiry(
    preview?.payment ? Date.parse(preview.payment.expiresAt) : Infinity,
  );
  const engines = trackingEngines(source);
  function invalidatePreview() {
    version.current++;
    setPreview(null);
    setValue("consent", false);
  }
  async function submit(values: z.infer<typeof trackingConfigurationForm>) {
    if (schedule && !reviewing) {
      try {
        await onSaveMetadata?.({
          name: values.scheduleName,
          cron: values.cron,
          timezone: values.timezone,
          enabled: values.enabled,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("couldNotSaveChanges"));
      }
      return;
    }
    if (count === 0) {
      setError(t("noActivePrompts"));
      return;
    }
    const requestedVersion = ++version.current;
    startPreview(async () => {
      setError(null);
      try {
        const nextPreview = await onPreview(trackingRunConfigurations(values), {
          paymentScope: scheduleMode ? "recurring" : "manual",
          ...(scheduleMode
            ? {
                paymentRecurrence: { cron: values.cron, timezone: values.timezone },
                ...(schedule ? { paymentScheduleId: schedule.id } : {}),
              }
            : {}),
        });
        if (version.current === requestedVersion) setPreview(nextPreview);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("previewUnavailable"));
      }
    });
  }
  return (
    <AppDrawer
      title={scheduleMode ? t("configureSchedule") : t("configureARun")}
      description={t("previewDescription", { count })}
      open={open}
      onClose={onClose}
      sheetOnMobile
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit(submit)}
        onChange={(event) => {
          const target = event.target;
          if (
            !(target instanceof HTMLInputElement) ||
            (target.name !== "consent" && target.name !== "enabled")
          ) {
            invalidatePreview();
          }
        }}
      >
        {scheduleMode && (
          <div className="space-y-3">
            <label htmlFor="tracking-schedule-name" className="block text-sm">
              {t("scheduleName")}
              <Input id="tracking-schedule-name" {...register("scheduleName")} />
            </label>
            <label htmlFor="tracking-schedule-cron" className="block text-sm">
              {t("cronExpression")}
              <Input id="tracking-schedule-cron" {...register("cron")} />
            </label>
            <label htmlFor="tracking-timezone" className="block text-sm">
              {t("timezone")}
              <Input id="tracking-timezone" {...register("timezone")} />
            </label>
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <Checkbox
                  name={field.name}
                  checked={field.value}
                  onChange={(event) => {
                    field.onChange(event.target.checked);
                    invalidatePreview();
                    if (event.target.checked && !schedule?.enabled) setReplaceConfiguration(true);
                  }}
                  label={t("enableSchedule")}
                />
              )}
            />
          </div>
        )}
        {schedule && !reviewing ? (
          <TrackingSavedConfiguration
            schedule={schedule}
            count={count}
            onReview={() => setReplaceConfiguration(true)}
          />
        ) : null}
        {reviewing && (
          <>
            {schedule && (
              <p className="text-xs leading-5 text-fg-muted">
                {t("replacementConfigurationScope")}
              </p>
            )}
            <TrackingSourceControls
              control={control}
              source={source}
              engines={engines}
              onCatalog={onCatalog}
              onInvalidate={invalidatePreview}
            />
          </>
        )}
        <p className="rounded-card border border-border bg-bg-sunken p-3 text-xs leading-5 text-fg-muted">
          {t("consumerScrapersMeasureTheConsumerSurfaceModelAPI")}
        </p>
        {reviewing && count === 0 ? (
          <p role="status" className="m-0 text-sm text-fg-muted">
            {t("noActivePrompts")}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          loading={busy}
          disabled={launchUnconfirmed || (reviewing && count === 0)}
        >
          {reviewing ? t("previewConfigurationAndCost") : t("saveSchedule")}
        </Button>
        {(error || mutationError) && (
          <p role="alert" className="text-sm text-red-text">
            {error || mutationError}
          </p>
        )}
        {launchUnconfirmed && !busy ? (
          <p role="status" className="text-xs text-fg-muted">
            {paymentT("requestUnconfirmed")}
          </p>
        ) : null}
        {preview && (
          <div className="rounded-card border border-border p-4">
            <PaymentQuoteSummary quote={preview.payment} label={paymentT("forecast")} />
            <p className="mt-2 text-xs text-fg-muted">{paymentT("forecastRisk")}</p>
            {expired ? (
              <p role="alert" className="text-xs text-warning">
                {paymentT("expired")}
              </p>
            ) : null}
            <Button
              className="mt-4"
              disabled={
                busy ||
                launchUnconfirmed ||
                !preview.payment ||
                (!expired && !preview.payment.availability.allowed)
              }
              onClick={async () => {
                if (expired) {
                  await handleSubmit(submit)();
                  return;
                }
                setLaunchUnconfirmed(true);
                try {
                  await onLaunch(
                    preview,
                    scheduleMode
                      ? {
                          name: watch("scheduleName"),
                          cron: watch("cron"),
                          timezone: watch("timezone"),
                          enabled: watch("enabled"),
                          consent: true,
                        }
                      : undefined,
                  );
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : t("runFailed"));
                  if (
                    cause instanceof Error &&
                    "reason" in cause &&
                    [
                      "payment_quote_changed",
                      "payment_quote_expired",
                      "payment_quote_required",
                    ].includes(String(cause.reason))
                  ) {
                    setLaunchUnconfirmed(false);
                    setPreview(null);
                  }
                }
              }}
            >
              {expired
                ? paymentT("refreshPrice")
                : scheduleMode
                  ? t("saveSchedule")
                  : t("approveAndQueueRun")}
              {!expired && preview.payment
                ? ` · ${formatPaymentAmount(preview.payment.charge, locale)}`
                : ""}
            </Button>
          </div>
        )}
      </form>
    </AppDrawer>
  );
}
