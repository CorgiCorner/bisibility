"use client";

import {
  AccountEmailChangeSteps,
  type ConfirmAccountEmailChange,
  type RequestAccountEmailChange,
  type RequestAccountEmailChangeCode,
} from "@/components/account/AccountEmailChangeSteps";
import { AccountEmailConfirmation } from "@/components/account/AccountEmailConfirmation";
import { AccountSection } from "@/components/account/AccountSection";
import {
  type VerificationCodeForm,
  verificationCodeSchema,
} from "@/components/account/account-email-form";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { StatusPill } from "@/components/ui/StatusPill";
import type {
  CurrentAccountEmailVerificationRequested,
  CurrentAccountEmailVerified,
} from "@/lib/actions/account-email";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAccountActionError } from "./useAccountActionError";

export type {
  ConfirmAccountEmailChange,
  ConfirmAccountEmailChangeInput,
  RequestAccountEmailChange,
  RequestAccountEmailChangeCode,
  RequestAccountEmailChangeInput,
} from "@/components/account/AccountEmailChangeSteps";

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
  requestAccountEmailChangeCode?: RequestAccountEmailChangeCode;
  requestCurrentAccountEmailVerification?: RequestCurrentAccountEmailVerification;
};

export function AccountEmailCard({
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  email,
  emailVerified,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
  requestCurrentAccountEmailVerification,
}: Readonly<AccountEmailCardProps>) {
  const t = useTranslations("account.email");
  const accountErrors = useAccountActionError();
  const confirmationForm = useForm<VerificationCodeForm>({
    defaultValues: { code: "" },
    mode: "onChange",
    resolver: zodResolver(verificationCodeSchema),
  });
  const router = useRouter();
  const [currentEmail, setCurrentEmail] = useState(email);
  const [verified, setVerified] = useState(emailVerified);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [codeRequested, setCodeRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const changeActions =
    requestAccountEmailChangeCode && requestAccountEmailChange && confirmAccountEmailChange
      ? { confirmAccountEmailChange, requestAccountEmailChange, requestAccountEmailChangeCode }
      : null;
  const canVerifyCurrentEmail = Boolean(
    requestCurrentAccountEmailVerification && confirmCurrentAccountEmailVerification,
  );

  async function sendCode() {
    if (!requestCurrentAccountEmailVerification) return;

    setErrorMessage(null);
    setCodeRequested(false);
    setSendingCode(true);
    try {
      const result = await requestCurrentAccountEmailVerification({ email: currentEmail });
      setCurrentEmail(result.email);
      confirmationForm.reset({ code: "" });
      setCodeRequested(true);
    } catch (error: unknown) {
      setErrorMessage(accountErrors.email(error, t("sendError")));
    } finally {
      setSendingCode(false);
    }
  }

  async function confirmEmail() {
    if (!confirmCurrentAccountEmailVerification) return;

    const valid = await confirmationForm.trigger();
    if (!valid) return;

    setErrorMessage(null);
    setConfirming(true);
    try {
      const result = await confirmCurrentAccountEmailVerification({
        code: confirmationForm.getValues("code").trim(),
        email: currentEmail,
      });
      confirmationForm.reset({ code: "" });
      setCurrentEmail(result.email);
      setVerified(true);
      setCodeRequested(false);
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(accountErrors.email(error, t("confirmError")));
    } finally {
      setConfirming(false);
    }
  }

  function onChanged(changedEmail: string) {
    setCurrentEmail(changedEmail);
    setVerified(true);
    router.refresh();
  }

  return (
    <div
      data-account-card-frame="email"
      data-account-email-state={verified ? "verified" : "unverified"}
    >
      <AccountSection description={t("description")} title={t("title")}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <FieldLabel
              className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
              htmlFor="account-email"
              label={t("label")}
            />
            <StatusPill
              label={verified ? t("verified") : t("unverified")}
              size="sm"
              status={verified ? "connected" : "needs_reauth"}
            />
          </div>
          <Input id="account-email" readOnly value={currentEmail} />
        </div>
        {!verified && canVerifyCurrentEmail ? (
          <AccountEmailConfirmation
            canConfirm={canVerifyCurrentEmail}
            codeError={confirmationForm.formState.errors.code}
            confirming={confirming}
            description={t("confirmDescription", { email: currentEmail })}
            onConfirm={confirmEmail}
            onSendCode={sendCode}
            register={confirmationForm.register}
            sendingCode={sendingCode}
          />
        ) : null}
        {verified && changeActions ? (
          <AccountEmailChangeSteps
            {...changeActions}
            currentEmail={currentEmail}
            onChanged={onChanged}
          />
        ) : null}
        {!changeActions && !canVerifyCurrentEmail ? (
          <p className="m-0 mt-3 text-[12px] leading-5 text-fg-muted">
            {verified ? t("verifiedFallback") : t("unverifiedFallback")}
          </p>
        ) : null}
        {codeRequested ? (
          <p aria-live="polite" className="m-0 mt-2 text-[11.5px] text-green-text">
            {t("codeSent")}
          </p>
        ) : null}
        {errorMessage ? (
          <p aria-live="polite" className="m-0 mt-2 text-[11.5px] text-red-text">
            {errorMessage}
          </p>
        ) : null}
      </AccountSection>
    </div>
  );
}
