"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { domainSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

const domainChangeSchema = z.object({
  confirmationDomain: z.string().trim().max(253),
  newDomain: domainSchema,
});

type DomainChangeForm = z.infer<typeof domainChangeSchema>;

export type DomainChangeRequest = {
  confirmationDomain: string;
  newDomain: string;
  projectId: string;
};

export type DomainChangeConfirmationProps = {
  currentDomain: string | null;
  onClose: () => void;
  onConfirmed?: (domain: string) => void;
  open: boolean;
  projectId: string;
  requestDomainChange: (request: DomainChangeRequest) => Promise<unknown>;
};

const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function DomainChangeConfirmation({
  currentDomain,
  onClose,
  onConfirmed,
  open,
  projectId,
  requestDomainChange,
}: Readonly<DomainChangeConfirmationProps>) {
  const t = useTranslations("projectSettingsGeneral.domainChange");
  const validationT = useTranslations("projectSettingsGeneral.validation");
  const renderedCurrentDomain = currentDomain?.trim() ?? "";
  const hasCurrentDomain = renderedCurrentDomain.length > 0;
  const form = useForm<DomainChangeForm>({
    defaultValues: { confirmationDomain: "", newDomain: renderedCurrentDomain },
    mode: "onChange",
    resolver: zodResolver(domainChangeSchema),
  });
  const requestedDomain = form.watch("newDomain")?.trim() ?? "";
  const confirmationDomain = form.watch("confirmationDomain")?.trim() ?? "";
  const isChanged = requestedDomain !== renderedCurrentDomain;
  const isConfirmed = hasCurrentDomain
    ? confirmationDomain === renderedCurrentDomain
    : confirmationDomain === "";
  const canConfirm = form.formState.isValid && isChanged && isConfirmed;
  const newDomainError = form.formState.errors.newDomain;
  const confirmationError = form.formState.errors.confirmationDomain;
  const newDomainValidationMessage =
    newDomainError?.type === "too_big"
      ? validationT("domainTooLong")
      : newDomainError?.type === "too_small" || newDomainError?.type === "custom"
        ? validationT("invalidDomain")
        : newDomainError?.message;

  function close() {
    form.reset({ confirmationDomain: "", newDomain: renderedCurrentDomain });
    onClose();
  }

  async function submit(values: DomainChangeForm) {
    try {
      await requestDomainChange({
        confirmationDomain: values.confirmationDomain,
        newDomain: values.newDomain,
        projectId,
      });
      onConfirmed?.(values.newDomain);
      close();
    } catch (error: unknown) {
      form.setError("newDomain", {
        message: actionErrorMessage(error, t("error")),
      });
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={close} size="sm" type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            disabled={!canConfirm}
            form="domain-change-confirmation-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("confirming")}
            size="sm"
            type="submit"
          >
            {t("confirm")}
          </Button>
        </>
      }
      headerDivider
      onClose={close}
      open={open}
      size="md"
      title={t("title")}
    >
      <form
        className="space-y-4"
        id="domain-change-confirmation-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">{t("description")}</p>
        <div>
          <label className={labelClass} htmlFor="domain-change-next-domain">
            {t("newDomain")}
          </label>
          <Input
            autoComplete="url"
            className="mt-1.5 font-sans tabular-nums"
            id="domain-change-next-domain"
            spellCheck={false}
            {...form.register("newDomain")}
          />
          {newDomainError ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {newDomainValidationMessage}
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="domain-change-confirmation-domain">
            {hasCurrentDomain
              ? t("confirmationWithDomain", { domain: renderedCurrentDomain })
              : t("confirmationFirst")}
          </label>
          <Input
            autoComplete="off"
            className="mt-1.5 font-sans tabular-nums"
            id="domain-change-confirmation-domain"
            spellCheck={false}
            {...form.register("confirmationDomain")}
          />
          {confirmationError ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {validationT("confirmationTooLong")}
            </p>
          ) : hasCurrentDomain &&
            confirmationDomain &&
            confirmationDomain !== renderedCurrentDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {t("confirmationMustMatch", { domain: renderedCurrentDomain })}
            </p>
          ) : !hasCurrentDomain && confirmationDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {t("confirmationFirstError")}
            </p>
          ) : null}
        </div>
        <div className="rounded-control border border-dashed border-border px-3 py-2.5">
          <p className="m-0 font-sans tabular-nums text-[9.5px] uppercase tracking-[1.1px] text-fg-muted">
            {t("afterConfirmation")}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">{t("futureChecks")}</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
            {t("competitorHistory")}
          </p>
        </div>
      </form>
    </Modal>
  );
}
