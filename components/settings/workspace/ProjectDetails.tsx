"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { CopyButton } from "@/components/ui";
import { updateProjectDetails } from "@/lib/actions/settings";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createProjectSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const projectDetailsSchema = createProjectSchema.pick({ domain: true, name: true }).extend({
  projectId: z.string().trim().min(1).max(120),
});

type ProjectDetailsUpdateForm = z.infer<typeof projectDetailsSchema>;
type ProjectDetailsForm = z.infer<typeof projectDetailsSchema>;

type ProjectDetailsData = {
  domain: string;
  name: string;
  projectId: string;
};

export type ProjectDetailsProps = {
  canEdit: boolean;
  project: ProjectDetailsData;
  updateProject?: (input: ProjectDetailsUpdateForm) => Promise<Partial<ProjectDetailsData>>;
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const inputClass =
  "min-h-10 rounded-lg border border-border-strong bg-bg-sunken px-3 text-[13px] font-medium text-fg outline-none focus:border-accent";
const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export function ProjectDetails({
  canEdit,
  project,
  updateProject = updateProjectDetails,
}: Readonly<ProjectDetailsProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<ProjectDetailsForm>({
    resolver: zodResolver(projectDetailsSchema),
    defaultValues: project,
    mode: "onChange",
  });
  const { readOnly } = useProjectWriteMode();

  function onSubmit(values: ProjectDetailsForm) {
    if (!canEdit || readOnly) {
      return;
    }
    setMessage(null);
    startTransition(() => {
      const save = async () => {
        const updated = await updateProject({
          domain: values.domain,
          name: values.name,
          projectId: values.projectId,
        });
        return { ...project, ...values, ...updated };
      };

      void save()
        .then((updated) => {
          reset(updated);
          setMessage("Project details saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Project details could not be saved.")),
        );
    });
  }

  return (
    <SettingsSection
      action={
        <ProjectReadOnlyTooltip>
          <button
            className="inline-flex min-h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!canEdit || readOnly || isPending || !isDirty}
            form="project-details-form"
            type="submit"
          >
            {isPending ? "Saving" : "Save"}
          </button>
        </ProjectReadOnlyTooltip>
      }
      description="Rarely changed. Defines what bisibility tracks."
      title="Project details"
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        id="project-details-form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <label className={labelClass}>
          {"Project name "}
          <input className={inputClass} disabled={!canEdit} {...register("name")} />
          {errors.name ? (
            <span className={cn(feedbackClass, "text-red")}>{errors.name.message}</span>
          ) : null}
        </label>
        <label className={labelClass}>
          {"Domain "}
          <input
            className={cn(inputClass, "font-mono")}
            disabled={!canEdit}
            {...register("domain")}
          />
          {errors.domain ? (
            <span className={cn(feedbackClass, "text-red")}>{errors.domain.message}</span>
          ) : null}
        </label>
        <label className={labelClass}>
          {"Project ID "}
          <span className="flex min-h-10 items-center gap-2 rounded-lg border border-border-strong bg-bg-sunken px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium normal-case tracking-normal text-fg">
              {project.projectId}
            </span>
            <CopyButton label="Copy project ID" size="sm" text={project.projectId} />
          </span>
          <input type="hidden" {...register("projectId")} />
        </label>
        {message ? (
          <span className={cn(feedbackClass, "sm:col-span-2 text-fg-muted")}>{message}</span>
        ) : null}
      </form>
    </SettingsSection>
  );
}
