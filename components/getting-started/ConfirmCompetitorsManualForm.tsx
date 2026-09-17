"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type ConfirmCompetitorsManualFormProps = Readonly<{
  addManualCompetitor: (input: unknown) => Promise<unknown>;
  onClose: () => void;
  onCancel: () => void;
  cancelLabel: string;
  projectId: string;
}>;

type ManualCompetitorForm = { aliases: string; domain: string };

function manualCompetitorFormSchema(domainError: string) {
  return z.object({
    aliases: z.string(),
    domain: z.string().trim().min(1, domainError),
  });
}

function aliasesFromInput(value: string) {
  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export function ConfirmCompetitorsManualForm({
  addManualCompetitor,
  onClose,
  onCancel,
  cancelLabel,
  projectId,
}: ConfirmCompetitorsManualFormProps) {
  const t = useTranslations("projectGettingStarted.competitors.manual");
  const schema = manualCompetitorFormSchema(t("domainError"));
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ManualCompetitorForm>({
    defaultValues: { aliases: "", domain: "" },
    resolver: zodResolver(schema),
  });

  async function saveManualCompetitor(values: ManualCompetitorForm) {
    setActionError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? t("domainInvalid"));
      return;
    }
    try {
      await addManualCompetitor({
        aliases: aliasesFromInput(parsed.data.aliases),
        domain: parsed.data.domain,
        projectId,
      });
      onClose();
    } catch (error) {
      setActionError(actionErrorMessage(error, t("addError")));
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit(saveManualCompetitor)}>
      <label className="grid gap-1.5 text-[12px] font-semibold text-fg" htmlFor="competitor-domain">
        {t("domain")}
        <Input
          disabled={isSubmitting}
          id="competitor-domain"
          placeholder={t("domainPlaceholder")}
          {...register("domain")}
        />
        {errors.domain ? <span className="text-red-text">{errors.domain.message}</span> : null}
      </label>
      <label
        className="grid gap-1.5 text-[12px] font-semibold text-fg"
        htmlFor="competitor-aliases"
      >
        {t("aliases")}
        <Input
          disabled={isSubmitting}
          id="competitor-aliases"
          placeholder={t("aliasesPlaceholder")}
          {...register("aliases")}
        />
        <span className="text-[11px] font-normal leading-5 text-fg-muted">{t("aliasesHelp")}</span>
      </label>
      <div className="mt-1 flex justify-end gap-2">
        <Button
          disabled={isSubmitting}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          {cancelLabel}
        </Button>
        <Button disabled={isSubmitting} size="sm" type="submit">
          {isSubmitting ? t("adding") : t("add")}
        </Button>
      </div>
      {actionError ? (
        <p role="alert" className="text-[12px] text-red-text">
          {actionError}
        </p>
      ) : null}
    </form>
  );
}
