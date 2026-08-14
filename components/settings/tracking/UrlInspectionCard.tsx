"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { FieldLabel } from "@/components/ui";
import { updatePresenceInspectionBudget } from "@/lib/actions/presence-settings";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectInspectionBudgetSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<InspectionBudgetForm>({
    defaultValues: { inspectionDailyLimit: dailyLimit, projectId },
    mode: "onChange",
    resolver: zodResolver(projectInspectionBudgetSchema),
  });

  async function saveInspectionBudget() {
    if (!canEdit || !(await form.trigger())) {
      throw new Error("Check the highlighted settings before saving.");
    }
    const values = form.getValues();
    setSaveError(null);
    try {
      await updateInspectionBudget(values);
      form.reset(values);
      router.refresh();
    } catch (error: unknown) {
      setSaveError(actionErrorMessage(error, "URL inspection limit could not be saved."));
      throw error;
    }
  }

  return (
    <SettingsCard
      className={trackingCardGeometryClassNames.urlInspection}
      description="Daily Search Console index-status checks for tracked target URLs."
      onSave={saveInspectionBudget}
      title="URL inspection"
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset className="contents" disabled={!canEdit}>
          <SettingsField width="field">
            <FieldLabel
              className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
              htmlFor="inspection-daily-limit"
              label="Daily inspection limit"
            />
            <input
              aria-invalid={Boolean(form.formState.errors.inspectionDailyLimit)}
              className="mt-1.5 min-h-10 w-full rounded-lg border border-border-strong bg-transparent px-3 text-[13px] font-medium text-fg outline-none focus:border-accent"
              id="inspection-daily-limit"
              max={1000}
              min={0}
              type="number"
              {...form.register("inspectionDailyLimit", { valueAsNumber: true })}
            />
            {form.formState.errors.inspectionDailyLimit ? (
              <p className="m-0 mt-1 text-[11.5px] text-red-text">
                {form.formState.errors.inspectionDailyLimit.message}
              </p>
            ) : null}
          </SettingsField>
        </fieldset>
        <p className="m-0 mt-4 text-[12px] leading-[1.55] text-fg-muted">
          Google allows 2,000 inspections per day per property, shared across every tool using it.
          bisibility caps this at 1,000 to leave room for other tools sharing the property quota.
          URLs over the limit wait for the next day.
        </p>
        {saveError ? <p className="m-0 mt-3 text-[12px] text-red-text">{saveError}</p> : null}
      </form>
    </SettingsCard>
  );
}
