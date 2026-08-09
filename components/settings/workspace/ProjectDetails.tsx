"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, CopyButton, inputClassName } from "@/components/ui";
import { updateProjectDetails } from "@/lib/actions/settings";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createProjectSchema, trackedProjectDomain } from "@/lib/schemas/project";
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
  domain: string | null;
  name: string;
  projectId: string;
};

export type ProjectDetailsProps = {
  canEdit: boolean;
  project: ProjectDetailsData;
  updateProject?: (input: ProjectDetailsUpdateForm) => Promise<Partial<ProjectDetailsData>>;
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const inputClass = `${inputClassName} min-h-10 rounded-lg px-3 text-[13px] font-medium`;
const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export function ProjectDetails({
  canEdit,
  project,
  updateProject = updateProjectDetails,
}: Readonly<ProjectDetailsProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Historical rows may still hold a generated instance host. Nothing is served at
  // that name and the user never typed it, so the field renders as if unset.
  const enteredDomain = trackedProjectDomain(project.domain) ?? "";
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<ProjectDetailsForm>({
    resolver: zodResolver(projectDetailsSchema),
    defaultValues: { ...project, domain: enteredDomain },
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
          <Button
            disabled={!canEdit || readOnly || !isDirty}
            form="project-details-form"
            loading={isPending}
            loadingLabel="Saving"
            size="xs"
            type="submit"
            variant="primary"
          >
            Save
          </Button>
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
            <span className={cn(feedbackClass, "text-red-text")}>{errors.name.message}</span>
          ) : null}
        </label>
        <label className={labelClass}>
          {"Domain "}
          <input
            className={cn(inputClass, "font-mono", enteredDomain.length === 0 && "border-accent")}
            disabled={!canEdit}
            placeholder="yourdomain.com"
            {...register("domain")}
          />
          {errors.domain ? (
            <span className={cn(feedbackClass, "text-red-text")}>{errors.domain.message}</span>
          ) : null}
        </label>
        <label className={labelClass}>
          {"Project ID "}
          <span className="flex min-h-10 items-center gap-2 rounded-lg border border-border-strong bg-transparent px-3">
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
