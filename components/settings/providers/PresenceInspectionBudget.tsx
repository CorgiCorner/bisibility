"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, FieldLabel } from "@/components/ui";
import { updatePresenceInspectionBudget } from "@/lib/actions/presence-settings";
import { countLabel } from "@/lib/format/pluralize";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectInspectionBudgetSchema } from "@/lib/schemas/project";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { getInspectionSchedulePreview } from "@/lib/settings/options";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

type InspectionBudgetForm = z.infer<typeof projectInspectionBudgetSchema>;

export type PresenceInspectionBudgetProps = {
  dailyLimit: number;
  projectId: string;
  targetUrlCount: number;
  updateBudget?: (input: InspectionBudgetForm) => Promise<unknown>;
};

function consequence(targetUrlCount: number, dailyLimit: number) {
  const preview = getInspectionSchedulePreview(targetUrlCount, dailyLimit);
  if (dailyLimit === 0) {
    return `${countLabel(targetUrlCount, "tracked target URL")} at limit 0 -> index-status checks are disabled.`;
  }
  if (preview.daysPerInspection === 0) {
    return `${countLabel(0, "tracked target URL")} at limit ${dailyLimit} -> no URLs are waiting for inspection.`;
  }
  const unit = preview.daysPerInspection === 1 ? "day" : "days";
  return `${countLabel(targetUrlCount, "tracked target URL")} at limit ${dailyLimit} -> each URL is re-inspected every ${preview.daysPerInspection} ${unit}.`;
}

export function PresenceInspectionBudget({
  dailyLimit,
  projectId,
  targetUrlCount,
  updateBudget = updatePresenceInspectionBudget,
}: Readonly<PresenceInspectionBudgetProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<InspectionBudgetForm>({
    defaultValues: { inspectionDailyLimit: dailyLimit, projectId },
    resolver: zodResolver(projectInspectionBudgetSchema),
    mode: "onChange",
  });
  const limit = form.watch("inspectionDailyLimit");

  function onSubmit(values: InspectionBudgetForm) {
    if (readOnly) return;
    setMessage(null);
    startTransition(() => {
      void updateBudget(values)
        .then(() => {
          form.reset(values);
          setMessage("Inspection budget saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Inspection budget could not be saved.")),
        );
    });
  }

  return (
    <SettingsSection
      action={
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || !form.formState.isDirty}
            form="presence-inspection-budget-form"
            loading={isPending}
            loadingLabel="Saving"
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </ProjectReadOnlyTooltip>
      }
      description="Control daily Search Console URL Inspection usage for index-status checks."
      title="URL inspection"
    >
      <form
        className="space-y-3"
        id="presence-inspection-budget-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <input type="hidden" {...form.register("projectId")} />
        <div className="max-w-[240px]">
          <FieldLabel
            className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
            help={FIELD_HELP.inspectionDailyLimit}
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
            <p className="mt-1 text-[11.5px] text-red-text">
              {form.formState.errors.inspectionDailyLimit.message}
            </p>
          ) : null}
        </div>
        <p className="m-0 text-[12.5px] text-fg-muted">{consequence(targetUrlCount, limit)}</p>
        <p className="m-0 text-[12.5px] text-fg-muted">
          Google allows 2,000 inspections/day per property, shared across every project and tool
          using this property.
        </p>
        {message ? <p className="m-0 text-[11.5px] text-fg-muted">{message}</p> : null}
      </form>
    </SettingsSection>
  );
}
