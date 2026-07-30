"use client";

import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { FIRST_RUN_SIGN_IN_HEADER, FIRST_RUN_SIGN_IN_VALUE } from "@/lib/auth/first-run-request";
import {
  emptySetupOtp,
  type SetupFormValues,
  setupCompletionSchema,
} from "@/lib/auth/first-run-schema";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  ArrowRightIcon as ArrowRight,
  ShieldCheckIcon as ShieldCheck,
  TerminalWindowIcon as TerminalWindow,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { completeSetupAction, requestSetupCodeAction, type SetupActionResult } from "./actions";
import { type SetupStep, SetupStepper } from "./SetupStepper";
import { SetupSuccess } from "./SetupSuccess";

function applyActionError(
  result: Extract<SetupActionResult, { status: "error" }>,
  form: ReturnType<typeof useForm<SetupFormValues>>,
  setFormError: (message: string | null) => void,
) {
  if (result.field) {
    form.setError(result.field, { message: result.message });
    return;
  }
  setFormError(result.message);
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
  const [step, setStep] = useState<SetupStep>("account");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SetupFormValues>({
    defaultValues: {
      email: "",
      name: "",
      otp: emptySetupOtp(),
    },
    mode: "onSubmit",
    resolver: zodResolver(setupCompletionSchema),
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
      applyActionError(result, form, setFormError);
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
          field: "otp",
          message: isSetupCompletedError(response.error)
            ? "Administrator setup is already complete. Sign in to continue."
            : "That code is incorrect or expired. Request a new code and try again.",
          status: "error",
        },
        form,
        setFormError,
      );
      return;
    }

    const result = await completeSetupAction();
    if (result.status === "error") {
      applyActionError(result, form, setFormError);
      return;
    }
    setStep("done");
  }

  async function resendCode() {
    setFormError(null);
    const result = await requestSetupCodeAction(form.getValues());
    if (result.status === "error") {
      applyActionError(result, form, setFormError);
    }
  }

  function editAccount() {
    setFormError(null);
    form.clearErrors();
    form.setValue("otp", emptySetupOtp(), { shouldDirty: false });
    setStep("account");
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <SetupStepper current={step} />

      {step === "account" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">Welcome to Bisibility</h1>
            <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">
              This instance has no accounts yet. Create the administrator account to finish setting
              it up.
            </p>
          </div>
          <form className="flex flex-col gap-3.5" onSubmit={form.handleSubmit(requestCode)}>
            <label className="flex flex-col gap-[7px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              Your name
              <input
                aria-invalid={Boolean(errors.name)}
                autoComplete="name"
                className="min-h-11 rounded-[10px] border border-border-strong bg-bg-elev px-3.5 font-sans text-[14.5px] font-normal normal-case tracking-normal text-fg outline-none focus:border-accent"
                {...form.register("name")}
              />
            </label>
            {errors.name ? (
              <p className="-mt-2 m-0 text-[13px] text-red">{errors.name.message}</p>
            ) : null}
            <label className="flex flex-col gap-[7px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              Email address
              <input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                className="min-h-11 rounded-[10px] border border-border-strong bg-bg-elev px-3.5 font-sans text-[14.5px] font-normal normal-case tracking-normal text-fg outline-none focus:border-accent"
                inputMode="email"
                type="email"
                {...form.register("email")}
              />
            </label>
            {errors.email ? (
              <p className="-mt-2 m-0 text-[13px] text-red">{errors.email.message}</p>
            ) : null}
            {formError ? <p className="m-0 text-[13px] text-red">{formError}</p> : null}
            <Button
              className="w-full"
              endIcon={<ArrowRight size={15} weight="bold" />}
              loading={isSubmitting}
              loadingLabel="Sending code..."
              size="lg"
              type="submit"
            >
              Continue
            </Button>
          </form>
          <p className="m-0 flex items-start gap-2 text-[12.5px] leading-[1.55] text-fg-muted">
            <ShieldCheck aria-hidden className="mt-px shrink-0 text-accent-hover" size={15} />
            The first account becomes the instance administrator. Everyone else signs in normally
            after setup.
          </p>
        </>
      ) : null}

      {step === "verify" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">
              {mailerConfigured ? "Check your inbox" : "Grab the code from your logs"}
            </h1>
            {mailerConfigured ? (
              <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">
                We sent a 6-digit code to <strong className="font-semibold text-fg">{email}</strong>
                . Enter it to verify the address.
              </p>
            ) : null}
          </div>
          {!mailerConfigured ? (
            <div className="flex flex-col gap-2.5 rounded-[11px] border border-[#ecd9b8] bg-[#f7ead8] p-[13px_15px]">
              <div className="flex items-start gap-2.5">
                <TerminalWindow
                  aria-hidden
                  className="mt-px shrink-0 text-[#a06b2a]"
                  size={17}
                  weight="fill"
                />
                <p className="m-0 text-[13px] leading-[1.55] text-[#7a5620]">
                  Email delivery isn&apos;t configured yet, so we printed your code in the server
                  logs. Reading it there confirms you control this server.
                </p>
              </div>
              <code className="overflow-x-auto whitespace-nowrap rounded-lg bg-[#1a1813] p-2.5 font-mono text-[11.5px] text-[#e8e4d9]">
                [auth] setup code for {email}: ******
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
            {errors.otp ? <p className="m-0 text-[13px] text-red">{errors.otp.message}</p> : null}
            {formError ? <p className="m-0 text-[13px] text-red">{formError}</p> : null}
            <Button
              className="w-full"
              disabled={!otpComplete}
              loading={isSubmitting}
              loadingLabel="Creating administrator account..."
              size="lg"
              type="submit"
            >
              Verify and create account
            </Button>
          </form>
          <div className="flex justify-between text-[12.5px]">
            <button
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent-hover hover:underline"
              disabled={isSubmitting}
              onClick={resendCode}
              type="button"
            >
              Resend code
            </button>
            <button
              className="cursor-pointer border-0 bg-transparent p-0 text-fg-muted hover:underline"
              onClick={editAccount}
              type="button"
            >
              Use a different email
            </button>
          </div>
        </>
      ) : null}

      {step === "done" ? <SetupSuccess mailerConfigured={mailerConfigured} /> : null}
    </div>
  );
}
