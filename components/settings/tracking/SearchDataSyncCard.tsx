"use client";

import { SearchSyncStatusControl } from "@/components/search-insights/SearchSyncStatusControl";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { FieldLabel, MenuSelect, useToast } from "@/components/ui";
import { updateSearchSyncSettings } from "@/lib/actions/presence-settings";
import {
  pauseSearchInsightsImport,
  resumeSearchInsightsImport,
  retrySearchInsightsImport,
  type SearchInsightsImportAction,
} from "@/lib/actions/search-insights";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSearchSyncSchema } from "@/lib/schemas/project";
import { resolveSearchSyncControl } from "@/lib/search-insights/sync/control-model";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

type FormData = z.infer<typeof projectSearchSyncSchema>;
export type SearchSyncMetrics = {
  lastQuotaPausedAt: string | null;
  connectionStatus?: "connected" | "connected_no_property" | "needs_reauth" | "not_connected";
  lastActivityAt?: string | null;
  pauseStartedAt?: string | null;
  pausedReason?: string | null;
  safeError?: string | null;
  state?: string | null;
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
const depthOptions = [16, 12, 6, 3].map((value) => ({
  label: `${value} months`,
  value: String(value),
}));
const paceOptions = [
  { label: "Standard", value: "normal" },
  { label: "Reduced", value: "gentle" },
];
const paceHelp = {
  gentle: "Uses fewer provider requests and takes longer.",
  normal: "Uses the normal provider request rate.",
} as const;

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
  const router = useRouter();
  const { showToast } = useToast();
  const [pauseBusy, setPauseBusy] = useState(false);
  const form = useForm<FormData>({
    defaultValues: { pace, projectId, retentionMonths },
    resolver: zodResolver(projectSearchSyncSchema),
  });
  const control = resolveSearchSyncControl(metrics);
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: appPath(asProjectRef(projectId), "settings", "tracking"),
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
        showToast(result.message, { severity: "error" });
        return;
      }
      router.refresh();
    } catch {
      showToast("Search data sync action failed. Refresh the page and try again.", {
        severity: "error",
      });
    } finally {
      setPauseBusy(false);
    }
  }

  async function save() {
    if (!canEdit || !(await form.trigger()))
      throw new Error("Check the highlighted settings before saving.");
    const values = form.getValues();
    try {
      await updateSettings(values);
      form.reset(values);
      router.refresh();
    } catch (cause) {
      showToast(actionErrorMessage(cause, "Search data sync settings could not be saved."), {
        severity: "error",
      });
      throw cause;
    }
  }
  return (
    <SettingsCard
      contentClassName="mt-3"
      description="Control historical Search Console import depth and import speed."
      onSave={save}
      title="Search data sync"
    >
      {({ markDirty }) => (
        <form className="-mx-5" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="grid grid-cols-1 gap-4 px-4" disabled={!canEdit}>
            <SettingsField className="max-w-none" width="field">
              <FieldLabel label="Import depth" />
              <Controller
                control={form.control}
                name="retentionMonths"
                render={({ field }) => (
                  <MenuSelect
                    ariaLabel="Import depth"
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
            </SettingsField>
            <SettingsField className="max-w-none" width="field">
              <FieldLabel label="Import speed" />
              <Controller
                control={form.control}
                name="pace"
                render={({ field }) => (
                  <div>
                    <MenuSelect
                      ariaLabel="Import speed"
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
                      {paceHelp[field.value]}
                    </p>
                  </div>
                )}
              />
            </SettingsField>
          </fieldset>
          <div className="mt-4 px-4">
            <div className="rounded-md border border-border px-3 py-2">
              <SearchSyncStatusControl
                busy={pauseBusy}
                disabled={!canEdit}
                model={control}
                onAction={runContextAction}
                reconnectHref={reconnectHref}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 px-4 font-mono text-[11px] text-fg-muted">
            <span>requests today {metrics.requestsToday.toLocaleString("en-US")}</span>
            <span>planned remaining {metrics.plannedRemaining.toLocaleString("en-US")}</span>
            <span>last quota pause {metrics.lastQuotaPausedAt ?? "never"}</span>
          </div>
          <p className="m-0 mt-4 px-4 text-[12px] leading-[1.55] text-fg-muted">
            This quota is shared with other tools using the same property. Decreasing depth never
            deletes imported history.
          </p>
        </form>
      )}
    </SettingsCard>
  );
}
