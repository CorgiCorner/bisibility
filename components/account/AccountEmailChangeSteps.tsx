"use client";

import {
  type AccountEmailChangeForm,
  accountEmailChangeSchema,
  type VerificationCodeForm,
  verificationCodeSchema,
} from "@/components/account/account-email-form";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import type {
  AccountEmailChangeCodeRequested,
  AccountEmailChanged,
  AccountEmailChangeRequested,
} from "@/lib/actions/account-email";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type FieldError, useForm } from "react-hook-form";
import { useAccountActionError } from "./useAccountActionError";

export type RequestAccountEmailChangeCode = () => Promise<AccountEmailChangeCodeRequested>;

export type RequestAccountEmailChangeInput = { currentCode: string; newEmail: string };
export type RequestAccountEmailChange = (
  input: RequestAccountEmailChangeInput,
) => Promise<AccountEmailChangeRequested>;

export type ConfirmAccountEmailChangeInput = { code: string; newEmail: string };
export type ConfirmAccountEmailChange = (
  input: ConfirmAccountEmailChangeInput,
) => Promise<AccountEmailChanged>;

export type AccountEmailChangeStepsProps = {
  confirmAccountEmailChange: ConfirmAccountEmailChange;
  currentEmail: string;
  onChanged: (email: string) => void;
  requestAccountEmailChange: RequestAccountEmailChange;
  requestAccountEmailChangeCode: RequestAccountEmailChangeCode;
};

type Step = "current" | "details" | "new";

const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

function FieldMessage({
  error,
  id,
  message,
}: Readonly<{ error?: FieldError; id: string; message: string }>) {
  if (!error) return null;

  return (
    <p className="m-0 mt-1 text-[11.5px] text-red-text" id={id} role="alert">
      {message}
    </p>
  );
}

export function AccountEmailChangeSteps({
  confirmAccountEmailChange,
  currentEmail: _currentEmail,
  onChanged,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
}: Readonly<AccountEmailChangeStepsProps>) {
  const t = useTranslations("account.email.change");
  const emailT = useTranslations("account.email");
  const accountErrors = useAccountActionError();
  const detailsForm = useForm<AccountEmailChangeForm>({
    defaultValues: { currentCode: "", newEmail: "" },
    mode: "onSubmit",
    resolver: zodResolver(accountEmailChangeSchema),
  });
  const confirmForm = useForm<VerificationCodeForm>({
    defaultValues: { code: "" },
    mode: "onSubmit",
    resolver: zodResolver(verificationCodeSchema),
  });
  const [step, setStep] = useState<Step>("current");
  const [pendingEmail, setPendingEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>, fallback: "sendError" | "confirmError") {
    setErrorMessage(null);
    setBusy(true);
    try {
      await work();
    } catch (error: unknown) {
      setErrorMessage(accountErrors.email(error, t(fallback)));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    detailsForm.reset({ currentCode: "", newEmail: "" });
    confirmForm.reset({ code: "" });
    setPendingEmail("");
    setStep("current");
  }

  async function sendCurrentCode() {
    await run(async () => {
      await requestAccountEmailChangeCode();
      detailsForm.reset({ currentCode: "", newEmail: "" });
      setStep("details");
    }, "sendError");
  }

  async function requestChange(values: AccountEmailChangeForm) {
    await run(async () => {
      const result = await requestAccountEmailChange(values);
      confirmForm.reset({ code: "" });
      setPendingEmail(result.pendingEmail);
      setStep("new");
    }, "sendError");
  }

  async function confirmChange({ code }: VerificationCodeForm) {
    await run(async () => {
      const result = await confirmAccountEmailChange({ code, newEmail: pendingEmail });
      restart();
      onChanged(result.email);
    }, "confirmError");
  }

  return (
    <div className="mt-3 space-y-3" data-account-email-step={step}>
      {step === "current" ? (
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Button
            loading={busy}
            onClick={sendCurrentCode}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("start")}
          </Button>
        </div>
      ) : null}

      {step === "details" ? (
        <form className="space-y-3" onSubmit={detailsForm.handleSubmit(requestChange)}>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              className={labelClass}
              htmlFor="account-email-current-code"
              label={t("currentCode")}
            />
            <Input
              aria-describedby="account-email-current-code-error"
              aria-invalid={Boolean(detailsForm.formState.errors.currentCode)}
              id="account-email-current-code"
              inputMode="numeric"
              {...detailsForm.register("currentCode")}
            />
            <FieldMessage
              error={detailsForm.formState.errors.currentCode}
              id="account-email-current-code-error"
              message={emailT("invalidCode")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel className={labelClass} htmlFor="account-email-new" label={t("newEmail")} />
            <Input
              aria-describedby="account-email-new-error"
              aria-invalid={Boolean(detailsForm.formState.errors.newEmail)}
              id="account-email-new"
              {...detailsForm.register("newEmail")}
            />
            <FieldMessage
              error={detailsForm.formState.errors.newEmail}
              id="account-email-new-error"
              message={emailT("invalidEmail")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={restart} size="sm" type="button" variant="secondary">
              {t("cancel")}
            </Button>
            <Button className="ml-auto" loading={busy} size="sm" type="submit">
              {t("sendNewCode")}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "new" ? (
        <form className="space-y-3" onSubmit={confirmForm.handleSubmit(confirmChange)}>
          <p className="m-0 text-[12px] leading-5 text-fg-muted">
            {t("finishDescription", { email: pendingEmail })}
          </p>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              className={labelClass}
              htmlFor="account-email-new-code"
              label={t("newCode")}
            />
            <Input
              aria-describedby="account-email-new-code-error"
              aria-invalid={Boolean(confirmForm.formState.errors.code)}
              id="account-email-new-code"
              inputMode="numeric"
              {...confirmForm.register("code")}
            />
            <FieldMessage
              error={confirmForm.formState.errors.code}
              id="account-email-new-code-error"
              message={emailT("invalidCode")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={busy} size="sm" type="submit">
              {t("confirm")}
            </Button>
            <Button disabled={busy} onClick={restart} size="sm" type="button" variant="secondary">
              {t("restart")}
            </Button>
          </div>
        </form>
      ) : null}

      {errorMessage ? (
        <p aria-live="polite" className="m-0 text-[11.5px] text-red-text">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
