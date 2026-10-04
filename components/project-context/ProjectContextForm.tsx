"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

const fields = ["business", "audience", "products", "goals", "agentRules"] as const;

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
    <Card>
      <h2 className="text-[15px] font-semibold">{t("contextTitle")}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{t("contextDescription")}</p>
      <form className="mt-5 grid gap-5" onSubmit={form.handleSubmit(save)}>
        {fields.map((field) => (
          <div className="grid gap-2" key={field}>
            <label className="text-[13px] font-semibold" htmlFor={`context-${field}`}>
              {t(field)}
            </label>
            <p className="text-[12px] text-fg-muted" id={`context-${field}-hint`}>
              {t(`${field}Hint`)}
            </p>
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
          </div>
        ))}
        {failed ? (
          <p className="text-[13px] text-red-text" role="alert">
            {t("failed")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
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
        </div>
      </form>
    </Card>
  );
}
