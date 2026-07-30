"use client";

import { Button } from "@/components/ui";
import {
  type TwoFactorManagementInput,
  type TwoFactorMethod,
  twoFactorManagementSchema,
} from "@/lib/auth/two-factor-management-schema";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { feedbackClass, fieldInputClass, fieldLabelClass } from "./account-ui";

type TwoFactorManagementFormProps = {
  description: string;
  factorRequired: boolean;
  hasPasswordCredential: boolean;
  onCancel: () => void;
  onError: (message: string) => void;
  onSubmit: (values: TwoFactorManagementInput) => Promise<void>;
  submitLabel: string;
  variant?: "destructive" | "primary";
};

export function TwoFactorManagementForm({
  description,
  factorRequired,
  hasPasswordCredential,
  onCancel,
  onError,
  onSubmit,
  submitLabel,
  variant = "primary",
}: Readonly<TwoFactorManagementFormProps>) {
  const [pending, setPending] = useState(false);
  const form = useForm<TwoFactorManagementInput>({
    defaultValues: { code: "", method: "totp", password: "" },
    mode: "onSubmit",
    resolver: zodResolver(
      twoFactorManagementSchema({
        factorRequired,
        passwordRequired: hasPasswordCredential,
      }),
    ),
  });
  const method = form.watch("method");

  function selectMethod(nextMethod: TwoFactorMethod) {
    form.setValue("method", nextMethod);
    form.setValue("code", "");
    form.clearErrors("code");
  }

  async function submit(values: TwoFactorManagementInput) {
    setPending(true);
    try {
      await onSubmit(values);
    } catch {
      onError("Two-factor authentication could not be updated. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={form.handleSubmit(submit)}>
      <p className="text-[11.5px] text-fg-muted">{description}</p>
      {hasPasswordCredential ? (
        <label className={fieldLabelClass}>
          {"Account password "}
          <input
            autoComplete="current-password"
            className={fieldInputClass}
            type="password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <span className={cn(feedbackClass, "text-red")}>
              {form.formState.errors.password.message}
            </span>
          ) : null}
        </label>
      ) : null}
      {factorRequired ? (
        <>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Verification method</legend>
            <Button
              aria-pressed={method === "totp"}
              onClick={() => selectMethod("totp")}
              size="sm"
              type="button"
              variant={method === "totp" ? "primary" : "secondary"}
            >
              Authenticator code
            </Button>
            <Button
              aria-pressed={method === "backup_code"}
              onClick={() => selectMethod("backup_code")}
              size="sm"
              type="button"
              variant={method === "backup_code" ? "primary" : "secondary"}
            >
              Backup code
            </Button>
          </fieldset>
          <label className={fieldLabelClass}>
            {method === "totp" ? "Current authenticator code " : "Current backup code "}
            <input
              autoComplete="one-time-code"
              className={fieldInputClass}
              inputMode={method === "totp" ? "numeric" : "text"}
              maxLength={method === "totp" ? 6 : 11}
              {...form.register("code")}
            />
            {form.formState.errors.code ? (
              <span className={cn(feedbackClass, "text-red")}>
                {form.formState.errors.code.message}
              </span>
            ) : null}
          </label>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={pending} loadingLabel="Working" size="sm" type="submit" variant={variant}>
          {submitLabel}
        </Button>
        <Button disabled={pending} onClick={onCancel} size="sm" type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
