"use client";

import { Button, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { createIngestHookSchema } from "@/lib/schemas/ingestHook";
import { CheckCircleIcon as CheckCircle, PlusIcon as Plus } from "@phosphor-icons/react";
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

const inputClass =
  "mt-[7px] min-h-11 w-full rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] font-mono text-[13.5px] font-medium text-fg outline-none focus:border-accent";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";

export function DeployHookCreateModal({
  createHook,
  endpointUrl,
  onClose,
  onCreated,
  open,
  projectId,
}: Readonly<DeployHookCreateModalProps>) {
  const [issuedHook, setIssuedHook] = useState<IssuedDeployHook | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canCreate = Boolean(createHook && projectId);
  const form = useForm<CreateHookForm>({
    defaultValues: { label: "Production deploys", projectId: projectId ?? "" },
    mode: "onChange",
    resolver: zodResolver(createIngestHookSchema),
  });

  function handleClose() {
    setIssuedHook(null);
    setSubmitError(null);
    form.reset({ label: "Production deploys", projectId: projectId ?? "" });
    onClose();
  }

  async function onSubmit(values: CreateHookForm) {
    if (!createHook || !projectId) {
      setSubmitError("Deploy webhook creation is unavailable for this workspace.");
      return;
    }

    setSubmitError(null);
    try {
      const hook = await createHook({ ...values, projectId });
      setIssuedHook(hook);
      onCreated?.();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Deploy webhook could not be created.",
      );
    }
  }

  return (
    <Modal
      footer={
        issuedHook ? (
          <Button
            onClick={handleClose}
            size="sm"
            startIcon={<CheckCircle aria-hidden size={15} />}
            type="button"
          >
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} size="sm" type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!canCreate || !form.formState.isValid}
              form="create-deploy-hook-form"
              loading={form.formState.isSubmitting}
              loadingLabel="Creating"
              startIcon={<Plus aria-hidden size={15} weight="bold" />}
              type="submit"
            >
              Create webhook
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
          <span className="block">
            {issuedHook ? "New deploy webhook" : "Create deploy webhook"}
          </span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {issuedHook ? "The token is available one time." : "Name the inbound deploy endpoint."}
          </span>
        </span>
      }
    >
      {issuedHook ? (
        <DeployHookRevealContent endpointUrl={endpointUrl} issuedHook={issuedHook} />
      ) : (
        <form
          className="space-y-[18px]"
          id="create-deploy-hook-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <input type="hidden" {...form.register("projectId")} />
          <div>
            <label className={labelClass} htmlFor="deploy-hook-label">
              Webhook label
            </label>
            <input
              autoComplete="off"
              className={inputClass}
              id="deploy-hook-label"
              placeholder="Production deploys"
              {...form.register("label")}
            />
            {form.formState.errors.label ? (
              <div className="mt-1.5 text-[11.5px] font-medium text-red">
                {form.formState.errors.label.message}
              </div>
            ) : null}
          </div>
          {submitError ? (
            <div className="text-[12px] font-medium text-red">{submitError}</div>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
