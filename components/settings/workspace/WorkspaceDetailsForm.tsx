"use client";

import { CopyButton, MonoText } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createProjectSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const workspaceDetailsSchema = createProjectSchema.pick({ domain: true, name: true }).extend({
  projectId: z.string().trim().min(1).max(120),
});

type WorkspaceDetailsForm = z.infer<typeof workspaceDetailsSchema>;

export type WorkspaceDetailsFormProps = {
  updateProject?: (input: WorkspaceDetailsForm) => Promise<unknown>;
  workspace: { domain: string; name: string; projectId: string };
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const inputClass =
  "min-h-10 rounded-lg border border-border-strong bg-bg-sunken px-3 text-[13px] font-medium text-fg outline-none focus:border-accent";
const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export function WorkspaceDetailsForm({
  updateProject,
  workspace,
}: Readonly<WorkspaceDetailsFormProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<WorkspaceDetailsForm>({
    defaultValues: {
      domain: workspace.domain,
      name: workspace.name,
      projectId: workspace.projectId,
    },
    mode: "onChange",
    resolver: zodResolver(workspaceDetailsSchema),
  });
  const domainEmpty = workspace.domain.length === 0;

  function onSubmit(values: WorkspaceDetailsForm) {
    if (!updateProject) {
      return;
    }
    setMessage(null);
    startTransition(() => {
      void updateProject(values)
        .then(() => {
          reset(values);
          setMessage("Workspace details saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Workspace details could not be saved.")),
        );
    });
  }

  return (
    <section className="space-y-[14px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Workspace details</div>
          <div className="mt-[3px] text-[12.5px] text-fg-muted">
            Defines what bisibility tracks. Set the domain before adding keywords.
          </div>
        </div>
        {updateProject ? (
          <button
            className="inline-flex min-h-8 flex-none items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isPending || !isDirty}
            form="workspace-details-form"
            type="submit"
          >
            {isPending ? "Saving" : "Save"}
          </button>
        ) : null}
      </div>
      <form
        className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-bg-elev px-5 py-[18px]"
        id="workspace-details-form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className={labelClass}>
            {"Workspace name "}
            <input className={inputClass} disabled={!updateProject} {...register("name")} />
            {errors.name ? (
              <span className={cn(feedbackClass, "text-red")}>{errors.name.message}</span>
            ) : null}
          </label>
          <label className={labelClass}>
            {"Domain "}
            <input
              className={cn(inputClass, "font-mono", domainEmpty && "border-accent")}
              disabled={!updateProject}
              placeholder="vega-labs.com"
              {...register("domain")}
            />
            {errors.domain ? (
              <span className={cn(feedbackClass, "text-red")}>{errors.domain.message}</span>
            ) : null}
          </label>
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-[50%]">
          <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            Workspace ID
          </span>
          <span className="flex min-h-10 items-center gap-2 rounded-lg border border-border-strong bg-bg-sunken px-3">
            <MonoText className="min-w-0 flex-1 truncate" size="lg">
              {workspace.projectId}
            </MonoText>
            <CopyButton label="Copy workspace ID" size="sm" text={workspace.projectId} />
          </span>
        </div>
        <input type="hidden" {...register("projectId")} />
        {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
      </form>
    </section>
  );
}
