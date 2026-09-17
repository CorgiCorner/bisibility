"use client";

import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth/client";
import { FIRST_RUN_SIGN_IN_HEADER, FIRST_RUN_SIGN_IN_VALUE } from "@/lib/auth/first-run-request";
import {
  createSetupCompletionSchema,
  emptySetupOtp,
  type SetupFormValues,
} from "@/lib/auth/first-run-schema";
import { signInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { TerminalWindowIcon as TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { completeSetupAction, requestSetupCodeAction, type SetupActionResult } from "./actions";
import { type SetupStep, SetupStepper } from "./SetupStepper";
import { SetupSuccess } from "./SetupSuccess";

function applyActionError(
  result: Extract<SetupActionResult, { status: "error" }>,
  form: ReturnType<typeof useForm<SetupFormValues>>,
  setFormError: (message: string | null) => void,
  t: ReturnType<typeof useTranslations>,
) {
  const messages = {
    ALREADY_COMPLETED: "errors.alreadyCompleted",
    EXPIRED_CODE: "errors.expiredCode",
    INVALID_EMAIL: "validation.email",
    INVALID_NAME_LONG: "validation.nameLong",
    INVALID_NAME_REQUIRED: "validation.nameRequired",
    INVALID_OTP: "validation.otp",
    REQUEST_CODE_FAILED: "errors.requestCode",
    SETUP_FAILED: "errors.complete",
  } as const;
  const message = t(messages[result.code]);
  if (result.field) {
    form.setError(result.field, { message });
    return;
  }
  setFormError(message);
}

function isSetupCompletedError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "SETUP_ALREADY_COMPLETED" ||
    candidate.message === "Administrator setup is already complete."
  );
}

export function SetupWizard({ mailerConfigured }: Readonly<{ mailerConfigured: boolean }>) {
  const t = useTranslations("setup");
  const [step, setStep] = useState<SetupStep>("account");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SetupFormValues>({
    defaultValues: {
      email: "",
      name: "",
      otp: emptySetupOtp(),
    },
    mode: "onSubmit",
    resolver: zodResolver(
      createSetupCompletionSchema({
        email: t("validation.email"),
        nameLong: t("validation.nameLong"),
        nameRequired: t("validation.nameRequired"),
        otp: t("validation.otp"),
      }),
    ),
  });
  const otp = useWatch({ control: form.control, name: "otp" }) ?? [];
  const otpComplete = otp.length === 6 && otp.every((digit) => digit !== "");
  const { errors, isSubmitting } = form.formState;
  const email = form.getValues("email");

  async function requestCode(values: SetupFormValues) {
    setFormError(null);
    form.clearErrors();
    const result = await requestSetupCodeAction(values);
    if (result.status === "error") {
      applyActionError(result, form, setFormError, t);
      return;
    }
    setStep("verify");
  }

  async function completeSetup(values: SetupFormValues) {
    setFormError(null);
    form.clearErrors("otp");
    const response = await authClient.signIn.emailOtp({
      email: values.email,
      fetchOptions: {
        headers: {
          [FIRST_RUN_SIGN_IN_HEADER]: FIRST_RUN_SIGN_IN_VALUE,
        },
      },
      name: values.name,
      otp: values.otp.join(""),
    });
    if (response.error) {
      applyActionError(
        {
          code: isSetupCompletedError(response.error) ? "ALREADY_COMPLETED" : "EXPIRED_CODE",
          field: "otp",
          status: "error",
        },
        form,
        setFormError,
        t,
      );
      return;
    }

    const redirectUrl = signInRedirectUrl(response, window.location.origin);
    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return;
    }

    const result = await completeSetupAction();
    if (result.status === "error") {
      applyActionError(result, form, setFormError, t);
      return;
    }
    setStep("done");
  }

  async function resendCode() {
    setFormError(null);
    const result = await requestSetupCodeAction(form.getValues());
    if (result.status === "error") {
      applyActionError(result, form, setFormError, t);
    }
  }

  function editAccount() {
    setFormError(null);
    form.clearErrors();
    form.setValue("otp", emptySetupOtp(), { shouldDirty: false });
    setStep("account");
  }

  return (
    <div className="flex flex-col gap-5.5">
      <SetupStepper current={step} />

      {step === "account" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">{t("account.title")}</h1>
            <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">
              {t("account.description")}
            </p>
          </div>
          <form className="flex flex-col gap-3.5" onSubmit={form.handleSubmit(requestCode)}>
            <label className="flex flex-col gap-[7px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              {t("account.name")}
              <input
                aria-invalid={Boolean(errors.name)}
                autoComplete="name"
                className="min-h-11 rounded-control border border-border-control bg-transparent px-3.5 font-sans text-[14.5px] font-normal normal-case tracking-normal text-fg outline-none focus:border-accent"
                {...form.register("name")}
              />
            </label>
            {errors.name ? (
              <p className="-mt-2 m-0 text-[13px] text-red-text">{errors.name.message}</p>
            ) : null}
            <label className="flex flex-col gap-[7px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              {t("account.email")}
              <input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                className="min-h-11 rounded-control border border-border-control bg-transparent px-3.5 font-sans text-[14.5px] font-normal normal-case tracking-normal text-fg outline-none focus:border-accent"
                inputMode="email"
                type="email"
                {...form.register("email")}
              />
            </label>
            {errors.email ? (
              <p className="-mt-2 m-0 text-[13px] text-red-text">{errors.email.message}</p>
            ) : null}
            {formError ? <p className="m-0 text-[13px] text-red-text">{formError}</p> : null}
            <Button
              className="w-full"
              endIcon={<CaretRight size={15} weight="regular" />}
              loading={isSubmitting}
              loadingLabel={t("account.sendingCode")}
              size="lg"
              type="submit"
            >
              {t("account.sendCode")}
            </Button>
          </form>
          <p className="m-0 flex items-start gap-2 text-[12.5px] leading-[1.55] text-fg-muted">
            <ShieldCheck
              aria-hidden
              className="mt-px shrink-0 text-accent-text"
              size={15}
              weight="regular"
            />
            {t("account.notice")}
          </p>
        </>
      ) : null}

      {step === "verify" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">
              {mailerConfigured ? t("verify.title") : t("noMailer.title")}
            </h1>
            {mailerConfigured ? (
              <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">
                {t.rich("verify.description", {
                  recipient: (chunks) => (
                    <strong className="font-semibold text-fg">{chunks}</strong>
                  ),
                  email,
                })}
              </p>
            ) : null}
          </div>
          {!mailerConfigured ? (
            <div className="flex flex-col gap-2.5 rounded-control border border-[#ecd9b8] bg-[#f7ead8] p-[13px_15px]">
              <div className="flex items-start gap-2.5">
                <TerminalWindow
                  aria-hidden
                  className="mt-px shrink-0 text-[#a06b2a]"
                  size={17}
                  weight="regular"
                />
                <p className="m-0 text-[13px] leading-[1.55] text-[#7a5620]">
                  {t("noMailer.description")}
                </p>
              </div>
              <code className="overflow-x-auto whitespace-nowrap rounded-control bg-[#1a1813] p-2.5 font-mono text-[11.5px] text-[#e8e4d9]">
                {t("noMailer.codeLog", { email })}
              </code>
            </div>
          ) : null}
          <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(completeSetup)}>
            <div className="mx-auto w-full max-w-[333px]">
              <Controller
                control={form.control}
                name="otp"
                render={({ field }) => (
                  <OtpInput
                    disabled={isSubmitting}
                    error={Boolean(errors.otp)}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    ref={field.ref}
                    value={field.value ?? []}
                  />
                )}
              />
            </div>
            {errors.otp ? (
              <p className="m-0 text-[13px] text-red-text">{errors.otp.message}</p>
            ) : null}
            {formError ? <p className="m-0 text-[13px] text-red-text">{formError}</p> : null}
            <Button
              className="w-full"
              disabled={!otpComplete}
              loading={isSubmitting}
              loadingLabel={t("verify.submitting")}
              size="lg"
              type="submit"
            >
              {t("verify.submit")}
            </Button>
          </form>
          <div className="flex justify-between text-[12.5px]">
            <button
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent-text hover:underline"
              disabled={isSubmitting}
              onClick={resendCode}
              type="button"
            >
              {t("verify.resend")}
            </button>
            <button
              className="cursor-pointer border-0 bg-transparent p-0 text-fg-muted hover:underline"
              onClick={editAccount}
              type="button"
            >
              {t("verify.changeEmail")}
            </button>
          </div>
        </>
      ) : null}

      {step === "done" ? <SetupSuccess mailerConfigured={mailerConfigured} /> : null}
    </div>
  );
}
