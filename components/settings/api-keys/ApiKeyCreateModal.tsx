"use client";

import { Button, ExpiryChoiceGroup, inputClassName, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type IssueApiKeyInput, issueApiKeySchema } from "@/lib/schemas/apiKey";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { CheckCircleIcon as CheckCircle, PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiKeyRevealContent } from "./ApiKeyReveal";
import { apiKeyExpiryOptions, apiKeyScopeOptions, type IssuedApiKey } from "./api-key-model";

type IssueAction = (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
type IssueForm = z.infer<typeof issueApiKeySchema>;

export type ApiKeyCreateModalProps = {
  defaultName?: string;
  issueKey?: IssueAction;
  onClose: () => void;
  onIssued?: () => void;
  open: boolean;
  projectId?: string;
};

const inputClass = `${inputClassName} mt-[7px] min-h-11 w-full rounded-[9px] px-[13px] font-mono text-[13.5px] font-medium`;
const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function ApiKeyCreateModal({
  defaultName = "",
  issueKey,
  onClose,
  onIssued,
  open,
  projectId,
}: Readonly<ApiKeyCreateModalProps>) {
  const [issuedKey, setIssuedKey] = useState<IssuedApiKey | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canIssue = Boolean(issueKey && projectId);
  const form = useForm<IssueForm>({
    defaultValues: {
      expiresInDays: 90,
      name: defaultName,
      projectId: projectId ?? "",
      scope: "write",
    },
    mode: "onChange",
    resolver: zodResolver(issueApiKeySchema),
  });
  const selectedScope = form.watch("scope");
  const selectedExpiry = form.watch("expiresInDays");
  const hasValidName = issueApiKeySchema.shape.name.safeParse(form.watch("name")).success;

  function handleClose() {
    setIssuedKey(null);
    setSubmitError(null);
    form.reset({
      expiresInDays: 90,
      name: defaultName,
      projectId: projectId ?? "",
      scope: "write",
    });
    onClose();
  }

  async function onSubmit(values: IssueForm) {
    if (!issueKey || !projectId) {
      setSubmitError("API key creation is unavailable for this project.");
      return;
    }

    setSubmitError(null);
    try {
      const key = await issueKey({ ...values, projectId });
      setIssuedKey(key);
      onIssued?.();
    } catch (error) {
      setSubmitError(actionErrorMessage(error, "API key could not be created."));
    }
  }

  return (
    <Modal
      footer={
        issuedKey ? (
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
              disabled={!canIssue || !hasValidName}
              form="create-api-key-form"
              loading={form.formState.isSubmitting}
              loadingLabel="Creating"
              startIcon={<Plus aria-hidden size={15} weight="bold" />}
              type="submit"
            >
              Create key
            </Button>
          </>
        )
      }
      headerDivider
      initialFocus={() => form.setFocus("name")}
      onClose={handleClose}
      open={open}
      size="md"
      title={
        <span className="block">
          <span className="block">{issuedKey ? "New API key" : "Create API key"}</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {issuedKey
              ? "The full secret is available one time."
              : "Name the key and choose its access and expiry policy."}
          </span>
        </span>
      }
    >
      {issuedKey ? (
        <ApiKeyRevealContent issuedKey={issuedKey} showProjectGuidance />
      ) : (
        <form
          className="space-y-4.5"
          id="create-api-key-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <input type="hidden" {...form.register("projectId")} />
          <div>
            <label className={labelClass} htmlFor="api-key-name">
              Key name
            </label>
            <input
              autoComplete="off"
              className={inputClass}
              id="api-key-name"
              placeholder="Production"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <div className="mt-1.5 text-[11.5px] font-medium text-red-text">
                {form.formState.errors.name.message}
              </div>
            ) : null}
          </div>
          <div>
            <div className={labelClass}>Access</div>
            <div className="mt-[9px] grid gap-[7px]">
              {apiKeyScopeOptions.map((scope) => {
                const active = selectedScope === scope.value;
                return (
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[11px] border-[1.5px] px-[13px] py-[11px]",
                      active ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-elev",
                    )}
                    key={scope.value}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-fg">
                        {scope.label}
                      </span>
                      <span className="mt-px block text-[11.5px] text-fg-muted">{scope.desc}</span>
                    </span>
                    <input
                      className="sr-only"
                      type="radio"
                      value={scope.value}
                      {...form.register("scope")}
                    />
                    <span
                      className={cn(
                        "grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]",
                        active ? "border-accent" : "border-border-strong",
                      )}
                    >
                      <span
                        className={cn(
                          "h-[9px] w-[9px] rounded-full bg-accent",
                          !active && "invisible",
                        )}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedScope === "admin" ? (
              <p className="m-0 mt-2 text-[12px] font-medium text-yellow-text">
                Full access can perform admin operations for this project.
              </p>
            ) : null}
          </div>
          <div>
            <ExpiryChoiceGroup
              onChange={(days) =>
                form.setValue("expiresInDays", days, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              options={apiKeyExpiryOptions}
              value={selectedExpiry}
            />
            {selectedExpiry === null ? (
              <p className="m-0 mt-2 text-[12px] font-medium text-yellow-text">
                This key never expires and must be rolled or revoked manually.
              </p>
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
