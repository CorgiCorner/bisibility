"use client";

import { presentCompetitorValidationMessage } from "@/components/competitors/competitor-validation-presentation";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  type CompetitorDetails,
  competitorDetailsFormSchema,
} from "@/lib/actions/competitor-set-input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export function CompetitorDetailsDialog({
  competitor,
  onClose,
  onSave,
}: Readonly<{
  competitor?: CompetitorDetails;
  onClose: () => void;
  onSave: (input: CompetitorDetails) => Promise<unknown>;
}>) {
  const t = useTranslations("projectCompetitors.ui");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const formId = useId();
  const pending = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<z.input<typeof competitorDetailsFormSchema>, unknown, CompetitorDetails>({
    defaultValues: {
      aliases: competitor?.aliases.join(", ") ?? "",
      domain: competitor?.domain ?? "",
    },
    resolver: zodResolver(competitorDetailsFormSchema),
  });

  async function submit(values: CompetitorDetails) {
    if (pending.current) return;
    pending.current = true;
    setMessage(null);
    try {
      await onSave(values);
      onClose();
      router.refresh();
    } catch (error) {
      setMessage(presentSafeActionError(error, sharedErrors, t("saveError")));
    } finally {
      pending.current = false;
    }
  }

  function close() {
    if (!pending.current && !isSubmitting) onClose();
  }

  return (
    <Modal
      open
      onClose={close}
      title={competitor ? t("editCompetitor") : t("addCompetitor")}
      footer={
        <>
          <Button disabled={isSubmitting} onClick={close} size="sm" variant="secondary">
            {t("cancel")}
          </Button>
          <Button form={formId} loading={isSubmitting} size="sm" type="submit">
            {competitor ? t("saveChanges") : t("addCompetitor")}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" id={formId} onSubmit={handleSubmit(submit)}>
        <div className="grid gap-1.5 text-[12px] font-medium text-fg">
          <FieldLabel htmlFor={`${formId}-domain`} label={t("domain")} />
          <Input
            aria-label={t("competitorDomain")}
            aria-invalid={Boolean(errors.domain)}
            disabled={isSubmitting}
            id={`${formId}-domain`}
            placeholder={t("competitorDomainPlaceholder")}
            {...register("domain")}
          />
          {errors.domain?.message ? (
            <span className="text-red-text" role="alert">
              {presentCompetitorValidationMessage(errors.domain.message, t)}
            </span>
          ) : null}
        </div>
        <div className="grid gap-1.5 text-[12px] font-medium text-fg">
          <FieldLabel htmlFor={`${formId}-aliases`} label={t("brandAliasesOptional")} />
          <Input
            aria-label={t("competitorBrandAliases")}
            aria-invalid={Boolean(errors.aliases)}
            disabled={isSubmitting}
            id={`${formId}-aliases`}
            placeholder={t("brandAliasesPlaceholder")}
            {...register("aliases")}
          />
          <span className="text-[11px] font-normal text-fg-muted">{t("brandAliasesHint")}</span>
          {errors.aliases?.message ? (
            <span className="text-red-text" role="alert">
              {presentCompetitorValidationMessage(errors.aliases.message, t)}
            </span>
          ) : null}
        </div>
        {message ? (
          <span className="text-[11px] text-red-text" role="alert">
            {message}
          </span>
        ) : null}
      </form>
    </Modal>
  );
}
