"use client";

import { useDeveloperActionError } from "@/components/settings/developers/useDeveloperActionError";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createIngestHookSchema, DEFAULT_INGEST_HOOK_LABEL } from "@/lib/schemas/ingestHook";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DeployHookRevealContent } from "./DeployHookReveal";
import type { CreateDeployHookAction, IssuedDeployHook } from "./deploy-hook-model";

type CreateHookForm = z.infer<typeof createIngestHookSchema>;

export type DeployHookCreateModalProps = {
  createHook?: CreateDeployHookAction;
  endpointUrl: string;
  onClose: () => void;
  onCreated?: () => void;
  open: boolean;
  projectId?: string;
};

const inputClass = `${inputClassName} mt-[7px] min-h-11 w-full rounded-control px-[13px] font-sans tabular-nums text-[13.5px] font-medium`;
const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function DeployHookCreateModal({
  createHook,
  endpointUrl,
  onClose,
  onCreated,
  open,
  projectId,
}: Readonly<DeployHookCreateModalProps>) {
  const presentActionError = useDeveloperActionError();
  const t = useTranslations("projectSettingsDevelopers.webhooks");
  const [issuedHook, setIssuedHook] = useState<IssuedDeployHook | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canCreate = Boolean(createHook && projectId);
  const form = useForm<CreateHookForm>({
    defaultValues: { label: DEFAULT_INGEST_HOOK_LABEL, projectId: projectId ?? "" },
    mode: "onChange",
    resolver: zodResolver(createIngestHookSchema),
  });

  function handleClose() {
    setIssuedHook(null);
    setSubmitError(null);
    form.reset({ label: DEFAULT_INGEST_HOOK_LABEL, projectId: projectId ?? "" });
    onClose();
  }

  async function onSubmit(values: CreateHookForm) {
    if (!createHook || !projectId) {
      setSubmitError(t("errors.createUnavailable"));
      return;
    }

    setSubmitError(null);
    try {
      const hook = await createHook({ ...values, projectId });
      setIssuedHook(hook);
      onCreated?.();
    } catch (error) {
      setSubmitError(presentActionError.webhook(error, t("errors.create")));
    }
  }

  return (
    <Modal
      footer={
        issuedHook ? (
          <Button
            onClick={handleClose}
            size="sm"
            startIcon={<CheckCircle aria-hidden size={15} weight="regular" />}
            type="button"
          >
            {t("done")}
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} size="sm" type="button" variant="ghost">
              {t("cancel")}
            </Button>
            <Button
              disabled={!canCreate || !form.formState.isValid}
              form="create-deploy-hook-form"
              loading={form.formState.isSubmitting}
              loadingLabel={t("creating")}
              startIcon={<Plus aria-hidden size={15} weight="regular" />}
              type="submit"
            >
              {t("create")}
            </Button>
          </>
        )
      }
      headerDivider
      onClose={handleClose}
      open={open}
      size="md"
      title={
        <span className="block">
          <span className="block">{issuedHook ? t("newTitle") : t("createTitle")}</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {issuedHook ? t("newDescription") : t("createDescription")}
          </span>
        </span>
      }
    >
      {issuedHook ? (
        <DeployHookRevealContent endpointUrl={endpointUrl} issuedHook={issuedHook} />
      ) : (
        <form
          className="space-y-4.5"
          id="create-deploy-hook-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <input type="hidden" {...form.register("projectId")} />
          <div>
            <label className={labelClass} htmlFor="deploy-hook-label">
              {t("webhookLabel")}
            </label>
            <input
              autoComplete="off"
              className={inputClass}
              id="deploy-hook-label"
              placeholder={t("webhookPlaceholder")}
              {...form.register("label")}
            />
            {form.formState.errors.label ? (
              <div className="mt-1.5 text-[11.5px] font-medium text-red-text">
                {t("validationLabel")}
              </div>
            ) : null}
          </div>
          {submitError ? (
            <div className="text-[12px] font-medium text-red-text">{submitError}</div>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
