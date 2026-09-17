"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { StatusChip } from "@/components/ui/StatusChip";
import { updatePresenceInspectionBudget } from "@/lib/actions/presence-settings";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectInspectionBudgetSchema } from "@/lib/schemas/project";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

type InspectionBudgetForm = z.infer<typeof projectInspectionBudgetSchema>;
export type UpdateInspectionBudget = (input: InspectionBudgetForm) => Promise<unknown>;

type UrlInspectionCardProps = {
  canEdit: boolean;
  dailyLimit: number;
  projectId: string;
  updateInspectionBudget?: UpdateInspectionBudget;
};

export function UrlInspectionCard({
  canEdit,
  dailyLimit,
  projectId,
  updateInspectionBudget = updatePresenceInspectionBudget,
}: Readonly<UrlInspectionCardProps>) {
  const router = useRouter();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsTracking.inspection");
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<InspectionBudgetForm>({
    defaultValues: { inspectionDailyLimit: dailyLimit, projectId },
    mode: "onChange",
    resolver: zodResolver(projectInspectionBudgetSchema),
  });

  async function saveInspectionBudget() {
    if (!canEdit || !(await form.trigger())) {
      throw new Error(t("saveValidation"));
    }
    const values = form.getValues();
    setSaveError(null);
    try {
      await updateInspectionBudget(values);
      form.reset(values);
      router.refresh();
    } catch (error: unknown) {
      setSaveError(presentActionError(error, sharedErrors, t("saveError")));
      throw error;
    }
  }

  return (
    <SettingsCard
      action={canEdit ? undefined : <StatusChip label={t("readOnly")} tone="neutral" />}
      description={t("description")}
      onSave={saveInspectionBudget}
      showSave={canEdit}
      title={t("title")}
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset className="contents" disabled={!canEdit}>
          <SettingsField width="field">
            <FieldLabel
              className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
              htmlFor="inspection-daily-limit"
              label={t("dailyLimit")}
            />
            {canEdit ? (
              <input
                aria-invalid={Boolean(form.formState.errors.inspectionDailyLimit)}
                className="mt-1.5 min-h-10 w-full rounded-control border border-border-control bg-transparent px-3 text-[13px] font-medium text-fg outline-none focus:border-accent"
                id="inspection-daily-limit"
                max={1000}
                min={0}
                type="number"
                {...form.register("inspectionDailyLimit", { valueAsNumber: true })}
              />
            ) : (
              <p className="m-0 mt-1.5 text-[13px] font-medium text-fg">{dailyLimit}</p>
            )}
            {form.formState.errors.inspectionDailyLimit ? (
              <p className="m-0 mt-1 text-[11.5px] text-red-text">
                {form.formState.errors.inspectionDailyLimit.message}
              </p>
            ) : null}
          </SettingsField>
        </fieldset>
        <p className="m-0 mt-4 text-[12px] leading-[1.55] text-fg-muted">{t("help")}</p>
        {saveError ? <p className="m-0 mt-3 text-[12px] text-red-text">{saveError}</p> : null}
      </form>
    </SettingsCard>
  );
}
