"use client";

import {
  DomainChangeConfirmation,
  type DomainChangeRequest,
} from "@/components/settings/general/DomainChangeConfirmation";
import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { Button, CopyButton, FieldLabel, Input } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createProjectSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

const projectNameSchema = createProjectSchema.pick({ name: true });

type ProjectNameForm = z.infer<typeof projectNameSchema>;

export type GeneralProjectDetails = {
  domain: string | null;
  name: string;
  projectId: string;
};

export type UpdateProjectDetails = (input: {
  name: string;
  projectId: string;
}) => Promise<{ name: string }>;

export type ProjectDetailsCardProps = {
  canEdit: boolean;
  initialDomainConfirmationOpen?: boolean;
  project: GeneralProjectDetails;
  requestDomainChange: (request: DomainChangeRequest) => Promise<unknown>;
  updateProject: UpdateProjectDetails;
};

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const helpClass = "m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted";

export function ProjectDetailsCard({
  canEdit,
  initialDomainConfirmationOpen = false,
  project,
  requestDomainChange,
  updateProject,
}: Readonly<ProjectDetailsCardProps>) {
  const router = useRouter();
  const [domainConfirmationOpen, setDomainConfirmationOpen] = useState(
    initialDomainConfirmationOpen,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<ProjectNameForm>({
    defaultValues: { name: project.name },
    mode: "onChange",
    resolver: zodResolver(projectNameSchema),
  });

  async function saveProjectName() {
    if (!canEdit || !(await form.trigger("name"))) return;

    setSaveError(null);
    try {
      const updated = await updateProject({
        name: form.getValues("name"),
        projectId: project.projectId,
      });
      form.reset({ name: updated.name });
      router.refresh();
    } catch (error: unknown) {
      setSaveError(actionErrorMessage(error, "Project details could not be saved."));
      throw error;
    }
  }

  return (
    <>
      <SettingsCard
        className={generalSettingsCardGeometryClassNames.projectDetails}
        description="Who this project is. What a check counts as a match is decided in Tracking."
        onSave={saveProjectName}
        title="Project details"
      >
        <div className="space-y-4">
          <SettingsField width="md">
            <label className={labelClass} htmlFor="general-project-name">
              Project name
            </label>
            <Input
              disabled={!canEdit}
              id="general-project-name"
              className="mt-1.5"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </SettingsField>
          <SettingsField width="md">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel className={labelClass} htmlFor="general-project-domain" label="Domain" />
              <Button
                disabled={!canEdit}
                onClick={() => setDomainConfirmationOpen(true)}
                size="xs"
                type="button"
                variant="secondary"
              >
                Change domain
              </Button>
            </span>
            <Input
              aria-describedby="general-project-domain-help"
              className="mt-1.5 font-mono text-[12.5px]"
              id="general-project-domain"
              readOnly
              value={project.domain ?? ""}
            />
            <p className={helpClass} id="general-project-domain-help">
              A check counts a result as yours when this domain appears in it. Changing it needs a
              confirmation.
            </p>
          </SettingsField>
          <SettingsField width="md">
            <FieldLabel className={labelClass} label="Project ID" />
            <span className="mt-1.5 flex min-h-10 items-center gap-2 rounded-[9px] border border-border-strong bg-bg-sunken px-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-muted">
                {project.projectId}
              </span>
              <CopyButton label="Copy project ID" size="sm" text={project.projectId} />
            </span>
          </SettingsField>
          {saveError ? <p className="m-0 text-[12px] text-red-text">{saveError}</p> : null}
        </div>
      </SettingsCard>
      <DomainChangeConfirmation
        currentDomain={project.domain}
        onClose={() => setDomainConfirmationOpen(false)}
        onConfirmed={() => router.refresh()}
        open={domainConfirmationOpen}
        projectId={project.projectId}
        requestDomainChange={requestDomainChange}
      />
    </>
  );
}
