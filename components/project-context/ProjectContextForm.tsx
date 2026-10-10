"use client";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type ProjectContextInput,
  type ProjectContextResource,
  projectContextSchema,
} from "@/lib/project-context/model";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  ProjectContextFields,
  ProjectContextFooter,
  ProjectContextLayout,
} from "./ProjectContextLayout";

function formValues(context: ProjectContextResource): ProjectContextInput {
  const { updatedAt: _updatedAt, ...values } = context;
  return values;
}

export function ProjectContextForm({
  projectId,
  context,
  canEdit,
  saveAction,
}: Readonly<{
  projectId: string;
  context: ProjectContextResource;
  canEdit: boolean;
  saveAction: (input: unknown) => Promise<ProjectContextResource>;
}>) {
  const t = useTranslations("agentWorkspace");
  const { showToast } = useToast();
  const [failed, setFailed] = useState(false);
  const form = useForm<ProjectContextInput>({
    defaultValues: formValues(context),
    resolver: zodResolver(projectContextSchema),
  });
  async function save(values: ProjectContextInput) {
    setFailed(false);
    try {
      const saved = await saveAction({ ...values, projectId });
      form.reset(formValues(saved));
      showToast(t("saved"), { severity: "success" });
    } catch {
      setFailed(true);
    }
  }
  return (
    <ProjectContextLayout>
      <form className="grid gap-5" onSubmit={form.handleSubmit(save)}>
        <ProjectContextFields>
          {(field) => (
            <>
              <Textarea
                {...form.register(field)}
                aria-describedby={`context-${field}-hint`}
                aria-invalid={Boolean(form.formState.errors[field])}
                disabled={!canEdit || form.formState.isSubmitting}
                id={`context-${field}`}
                invalid={Boolean(form.formState.errors[field])}
                maxLength={4000}
              />
              {form.formState.errors[field] ? (
                <p className="text-[12px] text-red-text" role="alert">
                  {t("validation")}
                </p>
              ) : null}
            </>
          )}
        </ProjectContextFields>
        {failed ? (
          <p className="text-[13px] text-red-text" role="alert">
            {t("failed")}
          </p>
        ) : null}
        <ProjectContextFooter>
          {canEdit ? (
            <Button
              disabled={!form.formState.isDirty}
              loading={form.formState.isSubmitting}
              loadingLabel={t("saving")}
              type="submit"
            >
              {t("save")}
            </Button>
          ) : (
            <p className="text-[13px] text-fg-muted">{t("readOnly")}</p>
          )}
        </ProjectContextFooter>
      </form>
    </ProjectContextLayout>
  );
}
