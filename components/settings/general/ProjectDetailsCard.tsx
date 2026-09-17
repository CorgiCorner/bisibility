"use client";

import {
  DomainChangeConfirmation,
  type DomainChangeRequest,
} from "@/components/settings/general/DomainChangeConfirmation";
import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { IdChip } from "@/components/ui/IdChip";
import { Input } from "@/components/ui/Input";
import { StatusChip } from "@/components/ui/StatusChip";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createProjectSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { VIEWER_READ_ONLY_LABEL } from "@/lib/ui/viewer-affordances";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const helpClass = "m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted";

export function ProjectDetailsCard({
  canEdit,
  initialDomainConfirmationOpen = false,
  project,
  requestDomainChange,
  updateProject,
}: Readonly<ProjectDetailsCardProps>) {
  const router = useRouter();
  const shellT = useTranslations("projectSettingsShell");
  const t = useTranslations("projectSettingsGeneral");
  const [domainConfirmationOpen, setDomainConfirmationOpen] = useState(
    initialDomainConfirmationOpen,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<ProjectNameForm>({
    defaultValues: { name: project.name },
    mode: "onChange",
    resolver: zodResolver(projectNameSchema),
  });
  const nameError = form.formState.errors.name;

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
      setSaveError(actionErrorMessage(error, t("projectDetails.saveError")));
      throw error;
    }
  }

  return (
    <>
      <SettingsCard
        action={canEdit ? undefined : <StatusChip label={VIEWER_READ_ONLY_LABEL} tone="neutral" />}
        className={generalSettingsCardGeometryClassNames.projectDetails}
        description={t("projectDetails.description")}
        onSave={saveProjectName}
        saveLabel={shellT("card.save")}
        savedLabel={shellT("card.saved")}
        showSave={canEdit}
        title={t("projectDetails.title")}
      >
        <div className="space-y-4">
          <SettingsField width="field">
            <label className={labelClass} htmlFor="general-project-name">
              {t("projectDetails.name")}
            </label>
            {canEdit ? (
              <Input
                disabled={!canEdit}
                id="general-project-name"
                className="mt-1.5"
                {...form.register("name")}
              />
            ) : (
              <p className="m-0 mt-1.5 text-[13px] font-medium text-fg">{project.name}</p>
            )}
            {nameError ? (
              <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
                {nameError.type === "too_big"
                  ? t("projectDetails.nameTooLong")
                  : t("projectDetails.nameRequired")}
              </p>
            ) : null}
          </SettingsField>
          <SettingsField width="field">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel
                className={labelClass}
                htmlFor="general-project-domain"
                label={t("projectDetails.domain")}
              />
              {canEdit ? (
                <Button
                  onClick={() => setDomainConfirmationOpen(true)}
                  size="xs"
                  type="button"
                  variant="secondary"
                >
                  {t("projectDetails.changeDomain")}
                </Button>
              ) : null}
            </span>
            {canEdit ? (
              <Input
                aria-describedby="general-project-domain-help"
                className="mt-1.5 font-sans tabular-nums text-[12.5px]"
                id="general-project-domain"
                readOnly
                value={project.domain ?? ""}
              />
            ) : (
              <p
                className="m-0 mt-1.5 font-sans tabular-nums text-[13px] font-medium text-fg"
                id="general-project-domain"
              >
                {project.domain || "—"}
              </p>
            )}
            <p className={helpClass} id="general-project-domain-help">
              {t("projectDetails.domainHelp")}
            </p>
          </SettingsField>
          <SettingsField width="field">
            <FieldLabel className={labelClass} label={t("projectDetails.projectId")} />
            <IdChip
              className="mt-1.5 flex min-h-10 justify-between bg-bg-sunken px-3"
              copyLabel={t("projectDetails.copyProjectId")}
              size="xs"
              value={project.projectId}
            />
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
