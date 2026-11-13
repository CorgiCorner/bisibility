"use client";

import { FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ManualReportInput } from "@/lib/agent-reports/manual-model";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";

export function ReportComposer({
  disabled,
  form,
}: Readonly<{ disabled: boolean; form: UseFormReturn<ManualReportInput> }>) {
  const t = useTranslations("agentWorkspace");
  const id = useId();
  return (
    <>
      <FormField htmlFor={`${id}-title`} label={t("reportTitle")}>
        <Input
          {...form.register("title")}
          aria-invalid={Boolean(form.formState.errors.title)}
          disabled={disabled}
          id={`${id}-title`}
          maxLength={160}
        />
      </FormField>
      <FormField htmlFor={`${id}-content`} label={t("reportContent")}>
        <Textarea
          {...form.register("analysis")}
          disabled={disabled}
          id={`${id}-content`}
          invalid={Boolean(form.formState.errors.analysis)}
          maxLength={12000}
        />
      </FormField>
      {Object.keys(form.formState.errors).length ? (
        <p className="m-0 text-ui-caption text-red-text" role="alert">
          {t("reportValidation")}
        </p>
      ) : null}
    </>
  );
}
