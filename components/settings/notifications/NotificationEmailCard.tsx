"use client";

import { NotificationEmailConfirmation } from "@/components/settings/notifications/NotificationEmailConfirmation";
import { notificationCardGeometryClassNames } from "@/components/settings/notifications/notification-card-layout";
import {
  type NotificationEmailForm,
  notificationEmailSchema,
  type VerificationCodeForm,
  verificationCodeSchema,
} from "@/components/settings/notifications/notification-email-form";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { FieldLabel, Input, StatusPill } from "@/components/ui";
import type {
  AccountEmailChanged,
  AccountEmailChangeRequested,
  CurrentAccountEmailVerificationRequested,
  CurrentAccountEmailVerified,
} from "@/lib/actions/account-email";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { useForm } from "react-hook-form";

export type RequestAccountEmailChangeInput = {
  newEmail: string;
};

export type RequestAccountEmailChangeResult = AccountEmailChangeRequested;

export type ConfirmAccountEmailChangeInput = {
  code: string;
  newEmail: string;
};

export type ConfirmAccountEmailChangeResult = AccountEmailChanged;

/**
 * These server action boundaries remain injectable for Storybook and component
 * tests. A request alone must never change the address.
 */
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

export type NotificationEmailCardProps = {
  confirmAccountEmailChange?: ConfirmAccountEmailChange;
  confirmCurrentAccountEmailVerification?: ConfirmCurrentAccountEmailVerification;
  preferences: NotificationPreferencesView;
  requestAccountEmailChange?: RequestAccountEmailChange;
  requestCurrentAccountEmailVerification?: RequestCurrentAccountEmailVerification;
};

export function NotificationEmailCard({
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  preferences,
  requestAccountEmailChange,
  requestCurrentAccountEmailVerification,
}: Readonly<NotificationEmailCardProps>) {
  const form = useForm<NotificationEmailForm>({
    defaultValues: { email: preferences.email },
    mode: "onChange",
    resolver: zodResolver(notificationEmailSchema),
  });
  const confirmationForm = useForm<VerificationCodeForm>({
    defaultValues: { code: "" },
    mode: "onChange",
    resolver: zodResolver(verificationCodeSchema),
  });
  const router = useRouter();
  const [emailVerification, setEmailVerification] = useState(preferences.emailVerification);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [codeRequested, setCodeRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const canChangeEmail = Boolean(requestAccountEmailChange && confirmAccountEmailChange);
  const canVerifyCurrentEmail = Boolean(
    requestCurrentAccountEmailVerification && confirmCurrentAccountEmailVerification,
  );
  const currentEmailVerified = pendingEmail ? true : emailVerification === "verified";

  async function requestChange(newEmail: string) {
    if (!requestAccountEmailChange) {
      throw new Error("Notification email changes are not available.");
    }

    const result = await requestAccountEmailChange({ newEmail });
    form.reset({ email: result.currentEmail });
    confirmationForm.reset({ code: "" });
    setPendingEmail(result.pendingEmail);
    setCodeRequested(true);
  }

  async function saveEmail() {
    setErrorMessage(null);
    try {
      await form.handleSubmit(async ({ email }) => requestChange(email))();
    } catch (error: unknown) {
      setErrorMessage(actionErrorMessage(error, "Notification email could not be saved."));
      throw error;
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
      if (!result) throw new Error("Notification email confirmation is not available.");
      form.reset({ email: result.email });
      confirmationForm.reset({ code: "" });
      setEmailVerification(result.emailVerification);
      setPendingEmail(null);
      setCodeRequested(false);
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(actionErrorMessage(error, "Notification email could not be confirmed."));
    } finally {
      setConfirming(false);
    }
  }

  function preventInvalidSave(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-settings-card-save]")) return;
    if (notificationEmailSchema.safeParse({ email: form.getValues("email") }).success) return;

    event.preventDefault();
    event.stopPropagation();
    void form.trigger();
  }

  return (
    <div
      data-notification-card-frame="email"
      data-notification-email-state={emailVerification}
      onClickCapture={preventInvalidSave}
    >
      <SettingsCard
        className={notificationCardGeometryClassNames.email}
        description="The address the email channel delivers to. This form saves on Save."
        onSave={saveEmail}
        title="Notification email"
      >
        <form id="notification-email-form" onSubmit={(event) => event.preventDefault()}>
          <SettingsField width="md">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <FieldLabel
                  className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
                  htmlFor="notification-email"
                  label={pendingEmail ? "Current notification email" : "Notification email"}
                />
                <StatusPill
                  label={currentEmailVerified ? "Verified" : "Unverified"}
                  size="sm"
                  status={currentEmailVerified ? "connected" : "needs_reauth"}
                />
              </div>
              <div className="min-w-0">
                <Input
                  aria-describedby="notification-email-error"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  className="min-w-0 flex-1"
                  id="notification-email"
                  readOnly={!canChangeEmail || Boolean(pendingEmail) || !currentEmailVerified}
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email ? (
                <p
                  className="m-0 text-[11.5px] text-red-text"
                  id="notification-email-error"
                  role="alert"
                >
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>
          </SettingsField>
          {pendingEmail ? (
            <NotificationEmailConfirmation
              canConfirm={canChangeEmail}
              codeError={confirmationForm.formState.errors.code}
              confirming={confirming}
              description={`New notification email pending confirmation: ${pendingEmail}. Enter its code to confirm the change.`}
              onConfirm={confirmEmail}
              onSendCode={sendCode}
              register={confirmationForm.register}
              sendingCode={sendingCode}
            />
          ) : !currentEmailVerified && canVerifyCurrentEmail ? (
            <NotificationEmailConfirmation
              canConfirm={canVerifyCurrentEmail}
              codeError={confirmationForm.formState.errors.code}
              confirming={confirming}
              description={`Enter the code sent to ${form.getValues("email")} to verify this notification email.`}
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
          <p className="m-0 mt-2 text-[12px] leading-5 text-fg-muted">
            Delivery is capped at {MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY} batches per rule per day.
          </p>
          {codeRequested ? (
            <p aria-live="polite" className="m-0 mt-2 text-[11.5px] text-green-text">
              If this address can be used, a verification code will arrive.
            </p>
          ) : null}
          {errorMessage ? (
            <p aria-live="polite" className={cn("m-0 mt-2 text-[11.5px] text-red-text")}>
              {errorMessage}
            </p>
          ) : null}
        </form>
      </SettingsCard>
    </div>
  );
}
