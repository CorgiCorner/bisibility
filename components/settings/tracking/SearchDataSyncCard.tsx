"use client";

import { useDateDisplay, useDateFormat } from "@/components/dates/DateFormatProvider";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { SearchSyncStatusControl } from "@/components/search-insights/SearchSyncStatusControl";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { StatusChip } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/toast-context";
import { updateSearchSyncSettings } from "@/lib/actions/presence-settings";
import {
  pauseSearchInsightsImport,
  resumeSearchInsightsImport,
  retrySearchInsightsImport,
  type SearchInsightsImportAction,
} from "@/lib/actions/search-insights";
import { formatDisplayDate } from "@/lib/dates/format";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSearchSyncSchema } from "@/lib/schemas/project";
import { monthsBefore } from "@/lib/search-insights/dates";
import {
  resolveSearchSyncControl,
  type SearchSyncControlFacts,
} from "@/lib/search-insights/sync/control-model";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import { searchSyncPreflightFacts } from "@/lib/settings/search-sync-config";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { localizeSearchSyncControl } from "./search-sync-presentation";

type FormData = z.infer<typeof projectSearchSyncSchema>;
export type SearchSyncMetrics = SearchSyncControlFacts & {
  firstDataDate?: string | null;
  firstDataDateLabel?: string | null;
  lastQuotaPausedAt: string | null;
  newestFinalizedDate?: string | null;
  plannedRemaining: number;
  requestsToday: number;
};
type Props = FormData & {
  canEdit: boolean;
  metrics: SearchSyncMetrics;
  pauseAction?: SearchInsightsImportAction;
  resumeAction?: SearchInsightsImportAction;
  retryAction?: SearchInsightsImportAction;
  updateSettings?: (input: FormData) => Promise<unknown>;
};
export function SearchDataSyncCard({
  canEdit,
  metrics,
  pace,
  projectId,
  retentionMonths,
  pauseAction = pauseSearchInsightsImport,
  resumeAction = resumeSearchInsightsImport,
  retryAction = retrySearchInsightsImport,
  updateSettings = updateSearchSyncSettings,
}: Readonly<Props>) {
  const dateFormat = useDateFormat();
  const dateDisplay = useDateDisplay();
  const router = useRouter();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsTracking.searchSync");
  const { showToast } = useToast();
  const [pauseBusy, setPauseBusy] = useState(false);
  const form = useForm<FormData>({
    defaultValues: { pace, projectId, retentionMonths },
    resolver: zodResolver(projectSearchSyncSchema),
  });
  const control = resolveSearchSyncControl(metrics, dateFormat);
  const localizedControl = localizeSearchSyncControl({
    control,
    dateDisplay,
    facts: metrics,
    t: t as unknown as (key: string, values?: Record<string, number | string>) => string,
  });
  const selectedRetentionMonths = form.watch("retentionMonths");
  const selectedPace = form.watch("pace");
  const preflight = searchSyncPreflightFacts({
    pace: selectedPace,
    retentionMonths: selectedRetentionMonths,
  });
  const estimate = t("preflightEstimate", {
    duration: preflight.duration,
    durationUnit: preflight.durationUnit,
    firstViewMinutes: preflight.firstViewMinutes,
    months: preflight.retentionMonths,
    pace: preflight.pace === "gentle" ? t("reduced") : t("standard"),
    requests: preflight.requests,
  });
  const firstDataDateLabel = metrics.firstDataDate
    ? formatDisplayDate(metrics.firstDataDate.slice(0, 10), dateDisplay)
    : null;
  const historyHelp =
    metrics.firstDataDate && firstDataDateLabel && metrics.newestFinalizedDate
      ? metrics.firstDataDate.slice(0, 10) >
        monthsBefore(metrics.newestFinalizedDate.slice(0, 10), selectedRetentionMonths)
        ? t("historyClamped", { date: firstDataDateLabel })
        : null
      : null;
  const depthOptions = [16, 12, 6, 3].map((value) => ({
    label: t("months", { count: value }),
    value: String(value),
  }));
  const paceOptions = [
    { label: t("standard"), value: "normal" },
    { label: t("reduced"), value: "gentle" },
  ];
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: appPath(asProjectRef(projectId), "settings", "data-sources"),
  });
  async function runContextAction() {
    if (!canEdit || pauseBusy || !control.action || control.action === "reconnect") return;
    setPauseBusy(true);
    const action =
      control.action === "pause"
        ? pauseAction
        : control.action === "resume"
          ? resumeAction
          : retryAction;
    try {
      const result = await action({ projectId, transition: control.action });
      if (!result.ok) {
        const message =
          control.action === "pause"
            ? t("pauseError")
            : control.action === "resume"
              ? t("resumeError")
              : t("retryError");
        showToast(message, { severity: "error" });
        return;
      }
      router.refresh();
    } catch {
      showToast(t("actionError"), {
        severity: "error",
      });
    } finally {
      setPauseBusy(false);
    }
  }

  async function save() {
    if (!canEdit || !(await form.trigger())) throw new Error(t("saveValidation"));
    const values = form.getValues();
    try {
      await updateSettings(values);
      form.reset(values);
      router.refresh();
    } catch (cause) {
      const message = presentActionError(cause, sharedErrors, t("saveError"));
      showToast(message, {
        severity: "error",
      });
      throw cause;
    }
  }
  return (
    <SettingsCard
      action={canEdit ? undefined : <StatusChip label={t("readOnly")} tone="neutral" />}
      contentClassName="mt-3"
      description={t("description")}
      onSave={save}
      showSave={canEdit}
      title={t("title")}
    >
      {({ markDirty }) => (
        <form className="-mx-5" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="grid grid-cols-1 gap-4 px-4" disabled={!canEdit}>
            <SettingsField className="max-w-none" width="field">
              <FieldLabel label={t("importDepth")} />
              {canEdit ? (
                <Controller
                  control={form.control}
                  name="retentionMonths"
                  render={({ field }) => (
                    <MenuSelect
                      ariaLabel={t("importDepth")}
                      disabled={!canEdit}
                      onChange={(value) => {
                        field.onChange(Number(value));
                        markDirty();
                      }}
                      options={depthOptions}
                      triggerClassName="mt-1.5 w-full justify-between"
                      value={String(field.value)}
                    />
                  )}
                />
              ) : (
                <p className="m-0 mt-1.5 text-[13px] font-medium text-fg">
                  {t("months", { count: retentionMonths })}
                </p>
              )}
              {historyHelp ? (
                <p className="m-0 mt-1.5 text-[11px] leading-[1.45] text-fg-muted">{historyHelp}</p>
              ) : null}
            </SettingsField>
            <SettingsField className="max-w-none" width="field">
              <FieldLabel label={t("importSpeed")} />
              {canEdit ? (
                <Controller
                  control={form.control}
                  name="pace"
                  render={({ field }) => (
                    <div>
                      <MenuSelect
                        ariaLabel={t("importSpeed")}
                        disabled={!canEdit}
                        onChange={(value) => {
                          field.onChange(value);
                          markDirty();
                        }}
                        options={paceOptions}
                        triggerClassName="mt-1.5 w-full justify-between"
                        value={field.value}
                      />
                      <p className="m-0 mt-1.5 text-[11px] leading-[1.45] text-fg-muted">
                        {estimate}
                      </p>
                    </div>
                  )}
                />
              ) : (
                <div>
                  <p className="m-0 mt-1.5 text-[13px] font-medium text-fg">
                    {pace === "gentle" ? t("reduced") : t("standard")}
                  </p>
                  <p className="m-0 mt-1.5 text-[11px] leading-[1.45] text-fg-muted">{estimate}</p>
                </div>
              )}
            </SettingsField>
          </fieldset>
          <div className="mt-4 px-4">
            <div className="rounded-md border border-border px-3 py-2">
              <SearchSyncStatusControl
                busy={pauseBusy}
                disabled={!canEdit}
                labels={{
                  actionAriaLabel: (action) =>
                    t("control.actionAria", {
                      action:
                        action === "pause"
                          ? t("control.pause")
                          : action === "resume"
                            ? t("control.resume")
                            : t("control.retry"),
                    }),
                  askAdminToConnect: t("control.askAdminToConnect"),
                  pauseTooltip: t("control.pauseTooltip"),
                }}
                model={localizedControl}
                onAction={runContextAction}
                reconnectHref={reconnectHref}
                suppressPauseTooltip
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-2 gap-y-1 px-4 font-sans tabular-nums text-[11px] text-fg-muted">
            <span>{t("requests", { count: metrics.requestsToday })}</span>
            <span aria-hidden>·</span>
            <span>{t("configuredPace", { count: searchSyncRequestSetsPerHour(pace) })}</span>
            <span aria-hidden>·</span>
            <span>{t("plannedRemaining", { count: metrics.plannedRemaining })}</span>
          </div>
          <p className="m-0 mt-4 px-4 text-[12px] leading-[1.55] text-fg-muted">{t("quota")}</p>
          <p className="m-0 mt-1 px-4 text-[12px] leading-[1.55] text-fg-muted">
            {t("depthChange")}
          </p>
        </form>
      )}
    </SettingsCard>
  );
}
