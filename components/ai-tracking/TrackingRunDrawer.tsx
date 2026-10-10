"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import type { AiCatalogOutcome } from "@/lib/ai-research/catalog-types";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import type {
  TrackingPreview,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { TrackingSourceControls } from "./TrackingSourceControls";

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
}: Readonly<{
  open: boolean;
  count: number;
  onClose: () => void;
  onPreview: (configurations: SourceConfiguration[]) => Promise<TrackingPreview>;
  onLaunch: (
    preview: TrackingPreview,
    schedule?: { name: string; cron: string; timezone: string; enabled: boolean },
  ) => Promise<void>;
  pending: boolean;
  schedule?: TrackingWorkspaceData["schedules"][number];
  onSaveMetadata?: (metadata: {
    name: string;
    cron: string;
    timezone: string;
    enabled: boolean;
  }) => Promise<void>;
  scheduleMode?: boolean;
  onCatalog?: () => Promise<AiCatalogOutcome>;
  mutationError?: string | null;
}>) {
  const t = useTranslations("projectAiTracking");
  const [previewPending, startPreview] = useTransition();
  const [replaceConfiguration, setReplaceConfiguration] = useState(false);
  const saved = schedule?.configurations?.[0];
  const reviewing = !schedule || replaceConfiguration;
  const version = useRef(0);
  const busy = pending || previewPending;
  const [preview, setPreview] = useState<TrackingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, control, watch, handleSubmit } = useForm<
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
  const consent = watch("consent");
  const engines =
    source === "google_aio"
      ? ["google"]
      : source === "consumer_scrape"
        ? ["chat_gpt", "gemini"]
        : ["chat_gpt"];
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
    const requestedVersion = ++version.current;
    startPreview(async () => {
      setError(null);
      try {
        const engine = engines.includes(values.engine)
          ? values.engine
          : (engines[0] as SourceConfiguration["engine"]);
        const endpoint =
          source === "google_aio"
            ? "serp/google/organic/task_post"
            : `ai_optimization/${engine}/${source === "model_api" ? "llm_responses" : "llm_scraper"}/task_post`;
        const nextPreview = await onPreview([
          {
            provider: "dataforseo",
            source: values.source,
            engine: engine as SourceConfiguration["engine"],
            endpoint,
            model: source === "model_api" ? values.model : null,
            parameters:
              source === "model_api"
                ? {
                    max_output_tokens: 1024,
                    web_search: false,
                    cost_policy: "provider_actual_cost",
                    actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
                    estimated_cost_limit_cents: 100,
                  }
                : { language_code: values.locale, location_name: values.location },
          },
        ]);
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
            version.current++;
            setPreview(null);
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
                    if (event.target.checked && !schedule?.enabled) setReplaceConfiguration(true);
                  }}
                  label={t("enableSchedule")}
                />
              )}
            />
          </div>
        )}
        {schedule && !reviewing && (
          <div className="rounded-card border border-border p-4 text-xs leading-5">
            <p>{t("savedConfigurationReview", { count: schedule.promptIds?.length ?? count })}</p>
            {schedule.configurations?.map((configuration, index) => (
              <p key={index} className="mt-2">
                {configuration.source} · {configuration.engine} ·{" "}
                {configuration.model ?? t("unknown")} ·{" "}
                {String(configuration.parameters.language_code ?? t("unknown"))} ·{" "}
                {String(configuration.parameters.location_name ?? t("unknown"))}
              </p>
            ))}
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={() => setReplaceConfiguration(true)}
            >
              {t("reviewReplacementConfiguration")}
            </Button>
          </div>
        )}
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
              onInvalidate={() => {
                version.current++;
                setPreview(null);
              }}
            />
          </>
        )}
        <p className="rounded-card border border-border bg-bg-sunken p-3 text-xs leading-5 text-fg-muted">
          {t("consumerScrapersMeasureTheConsumerSurfaceModelAPI")}
        </p>
        <Button type="submit" variant="secondary" loading={busy}>
          {reviewing ? t("previewConfigurationAndCost") : t("saveSchedule")}
        </Button>
        {(error || mutationError) && (
          <p role="alert" className="text-sm text-red-text">
            {error || mutationError}
          </p>
        )}
        {preview && (
          <div className="rounded-card border border-border p-4">
            <p className="text-sm font-semibold">
              {t("advisoryEstimate", { cost: (preview.estimatedCostCents / 100).toFixed(4) })}
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              {t("budgetAndCredentialsAreCheckedAgainBeforeLaunch")}
            </p>
            <Controller
              name="consent"
              control={control}
              render={({ field }) => (
                <Checkbox
                  name={field.name}
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                  label={t("iApproveThisRunAndTheProviderActual")}
                  containerClassName="mt-4"
                />
              )}
            />
            <Button
              className="mt-4"
              disabled={busy || ((scheduleMode ? watch("enabled") : true) && !consent)}
              onClick={async () => {
                try {
                  await onLaunch(
                    preview,
                    scheduleMode
                      ? {
                          name: watch("scheduleName"),
                          cron: watch("cron"),
                          timezone: watch("timezone"),
                          enabled: watch("enabled"),
                        }
                      : undefined,
                  );
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : t("runFailed"));
                }
              }}
            >
              {scheduleMode ? t("saveSchedule") : t("approveAndQueueRun")}
            </Button>
          </div>
        )}
      </form>
    </AppDrawer>
  );
}
