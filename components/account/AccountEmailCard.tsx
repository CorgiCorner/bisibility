"use client";

import { AccountEmailConfirmation } from "@/components/account/AccountEmailConfirmation";
import { AccountSection } from "@/components/account/AccountSection";
import {
  type AccountEmailForm,
  accountEmailSchema,
  type VerificationCodeForm,
  verificationCodeSchema,
} from "@/components/account/account-email-form";
import { accentButtonClass } from "@/components/account/account-ui";
import { FieldLabel, Input, StatusPill } from "@/components/ui";
import type {
  AccountEmailChanged,
  AccountEmailChangeRequested,
  CurrentAccountEmailVerificationRequested,
  CurrentAccountEmailVerified,
} from "@/lib/actions/account-email";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type RequestAccountEmailChangeInput = { newEmail: string };
export type RequestAccountEmailChangeResult = AccountEmailChangeRequested;
export type ConfirmAccountEmailChangeInput = { code: string; newEmail: string };
export type ConfirmAccountEmailChangeResult = AccountEmailChanged;

export type RequestAccountEmailChange = (
  input: RequestAccountEmailChangeInput,
) => Promise<RequestAccountEmailChangeResult>;

export type ConfirmAccountEmailChange = (
  input: ConfirmAccountEmailChangeInput,
) => Promise<ConfirmAccountEmailChangeResult>;

export type RequestCurrentAccountEmailVerification = (input: {
  email: string;
}) => Promise<CurrentAccountEmailVerificationRequested>;

export type ConfirmCurrentAccountEmailVerification = (input: {
  code: string;
  email: string;
}) => Promise<CurrentAccountEmailVerified>;

export type AccountEmailCardProps = {
  confirmAccountEmailChange?: ConfirmAccountEmailChange;
  confirmCurrentAccountEmailVerification?: ConfirmCurrentAccountEmailVerification;
  email: string;
  emailVerified: boolean;
  requestAccountEmailChange?: RequestAccountEmailChange;
  requestCurrentAccountEmailVerification?: RequestCurrentAccountEmailVerification;
};

export function AccountEmailCard({
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  email,
  emailVerified,
  requestAccountEmailChange,
  requestCurrentAccountEmailVerification,
}: Readonly<AccountEmailCardProps>) {
  const form = useForm<AccountEmailForm>({
    defaultValues: { email },
    mode: "onChange",
    resolver: zodResolver(accountEmailSchema),
  });
  const confirmationForm = useForm<VerificationCodeForm>({
    defaultValues: { code: "" },
    mode: "onChange",
    resolver: zodResolver(verificationCodeSchema),
  });
  const router = useRouter();
  const [emailVerification, setEmailVerification] = useState(
    emailVerified ? "verified" : "unverified",
  );
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [codeRequested, setCodeRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const canChangeEmail = Boolean(requestAccountEmailChange && confirmAccountEmailChange);
  const canVerifyCurrentEmail = Boolean(
    requestCurrentAccountEmailVerification && confirmCurrentAccountEmailVerification,
  );
  const currentEmailVerified = pendingEmail ? true : emailVerification === "verified";

  async function requestChange(newEmail: string) {
    if (!requestAccountEmailChange) {
      throw new Error("Account email changes are not available.");
    }
    const result = await requestAccountEmailChange({ newEmail });
    form.reset({ email: result.currentEmail });
    confirmationForm.reset({ code: "" });
    setPendingEmail(result.pendingEmail);
    setCodeRequested(true);
  }

  async function onSave({ email: newEmail }: AccountEmailForm) {
    setErrorMessage(null);
    setSaving(true);
    try {
      await requestChange(newEmail);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error: unknown) {
      setErrorMessage(actionErrorMessage(error, "Account email could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function sendCode() {
    if (!pendingEmail && (currentEmailVerified || !canVerifyCurrentEmail)) return;

    setErrorMessage(null);
    setCodeRequested(false);
    setSendingCode(true);
    try {
      if (pendingEmail) {
        await requestChange(pendingEmail);
      } else if (requestCurrentAccountEmailVerification) {
        const result = await requestCurrentAccountEmailVerification({
          email: form.getValues("email"),
        });
        form.reset({ email: result.email });
        confirmationForm.reset({ code: "" });
        setCodeRequested(true);
      }
    } catch (error: unknown) {
      setErrorMessage(actionErrorMessage(error, "Verification code could not be sent."));
    } finally {
      setSendingCode(false);
    }
  }

  async function confirmEmail() {
    if (!pendingEmail && (currentEmailVerified || !confirmCurrentAccountEmailVerification)) return;

    const valid = await confirmationForm.trigger();
    if (!valid) return;

    setErrorMessage(null);
    setConfirming(true);
    try {
      const code = confirmationForm.getValues("code").trim();
      const result = pendingEmail
        ? await confirmAccountEmailChange?.({ code, newEmail: pendingEmail })
        : await confirmCurrentAccountEmailVerification?.({ email: form.getValues("email"), code });
      if (!result) throw new Error("Account email confirmation is not available.");
      form.reset({ email: result.email });
      confirmationForm.reset({ code: "" });
      setEmailVerification(result.emailVerification);
      setPendingEmail(null);
      setCodeRequested(false);
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(actionErrorMessage(error, "Account email could not be confirmed."));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div data-account-card-frame="email" data-account-email-state={emailVerification}>
      <AccountSection
        action={
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-[12px] font-medium text-green-text">
              {saved ? <span data-account-email-saved="">Saved</span> : null}
            </span>
            <button
              className={accentButtonClass}
              disabled={!form.formState.isDirty || saving || Boolean(pendingEmail)}
              form="account-email-form"
              type="submit"
            >
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        }
        description="The email address used to sign in and receive verification codes."
        title="Account email"
      >
        <form id="account-email-form" onSubmit={form.handleSubmit(onSave)}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <FieldLabel
                className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
                htmlFor="account-email"
                label={pendingEmail ? "Current account email" : "Account email"}
              />
              <StatusPill
                label={currentEmailVerified ? "Verified" : "Unverified"}
                size="sm"
                status={currentEmailVerified ? "connected" : "needs_reauth"}
              />
            </div>
            <Input
              aria-describedby="account-email-error"
              aria-invalid={Boolean(form.formState.errors.email)}
              id="account-email"
              readOnly={!canChangeEmail || Boolean(pendingEmail) || !currentEmailVerified}
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="m-0 text-[11.5px] text-red-text" id="account-email-error" role="alert">
                {form.formState.errors.email.message}
              </p>
            ) : null}
          </div>
          {pendingEmail ? (
            <AccountEmailConfirmation
              canConfirm={canChangeEmail}
              codeError={confirmationForm.formState.errors.code}
              confirming={confirming}
              description={`New account email pending confirmation: ${pendingEmail}. Enter its code to confirm the change.`}
              onConfirm={confirmEmail}
              onSendCode={sendCode}
              register={confirmationForm.register}
              sendingCode={sendingCode}
            />
          ) : !currentEmailVerified && canVerifyCurrentEmail ? (
            <AccountEmailConfirmation
              canConfirm={canVerifyCurrentEmail}
              codeError={confirmationForm.formState.errors.code}
              confirming={confirming}
              description={`Enter the code sent to ${form.getValues("email")} to verify this account email.`}
              onConfirm={confirmEmail}
              onSendCode={sendCode}
              register={confirmationForm.register}
              sendingCode={sendingCode}
            />
          ) : (
            <p className="m-0 mt-3 text-[12px] leading-5 text-fg-muted">
              {currentEmailVerified
                ? "Verified with your login code. Changing it sends a new code."
                : "No code has been confirmed for this address yet."}
            </p>
          )}
          {codeRequested ? (
            <p aria-live="polite" className="m-0 mt-2 text-[11.5px] text-green-text">
              If this address can be used, a verification code will arrive.
            </p>
          ) : null}
          {errorMessage ? (
            <p aria-live="polite" className="m-0 mt-2 text-[11.5px] text-red-text">
              {errorMessage}
            </p>
          ) : null}
        </form>
      </AccountSection>
    </div>
  );
}
