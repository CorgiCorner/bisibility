"use client";

import { authClient } from "@/lib/auth/client";
import { mergeReturnToHash } from "@/lib/auth/return-to";
import { signInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  CaretRightIcon as CaretRight,
  CircleNotchIcon as CircleNotch,
  EnvelopeSimpleOpenIcon as EnvelopeSimpleOpen,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});
const otpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

type EmailForm = z.infer<typeof emailSchema>;
type OtpForm = z.infer<typeof otpSchema>;

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Try again.";
}

export function InviteSignInForm({ email }: Readonly<{ email: string }>) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const emailForm = useForm<EmailForm>({
    defaultValues: { email },
    resolver: zodResolver(emailSchema),
  });
  const otpForm = useForm<OtpForm>({
    defaultValues: { otp: "" },
    resolver: zodResolver(otpSchema),
  });

  async function requestCode(values: EmailForm) {
    setPending(true);
    setFormError(null);
    try {
      const response = await authClient.emailOtp.sendVerificationOtp({
        email: values.email,
        type: "sign-in",
      });
      if (response.error) {
        setFormError(errorMessage(response.error));
        return;
      }
      setStep("otp");
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(values: OtpForm) {
    setPending(true);
    setFormError(null);
    try {
      const response = await authClient.signIn.emailOtp({
        email: emailForm.getValues("email"),
        otp: values.otp,
      });
      if (response.error) {
        setFormError(errorMessage(response.error));
        return;
      }

      const destination = mergeReturnToHash(
        `${window.location.pathname}${window.location.search}`,
        window.location.hash,
      );
      const redirectUrl = signInRedirectUrl(response, window.location.origin, destination);
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  if (step === "otp") {
    return (
      <form className="mt-5 space-y-3" onSubmit={otpForm.handleSubmit(verifyCode)}>
        <div className="flex items-start gap-3 rounded-[12px] border border-border bg-bg-sunken p-3">
          <EnvelopeSimpleOpen
            aria-hidden
            className="mt-0.5 text-accent-text"
            size={18}
            weight="fill"
          />
          <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
            We sent a one-time code to{" "}
            <span className="font-mono font-semibold text-fg">{emailForm.getValues("email")}</span>.
          </p>
        </div>
        <label className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {"Sign-in code "}
          <input
            autoComplete="one-time-code"
            className="mt-2 block min-h-11 w-full rounded-[9px] border border-border-strong bg-transparent px-3 font-mono text-[15px] font-semibold tracking-[0.4px] text-fg outline-none focus:border-accent"
            disabled={pending}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            {...otpForm.register("otp")}
          />
        </label>
        {otpForm.formState.errors.otp ? (
          <p className="m-0 text-[12px] font-medium text-red-text">
            {otpForm.formState.errors.otp.message}
          </p>
        ) : null}
        {formError ? (
          <p className="m-0 text-[12px] font-medium text-red-text">{formError}</p>
        ) : null}
        <button
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-accent-solid px-4 text-[13px] font-semibold text-primary-contrast hover:opacity-90 disabled:bg-bg-sunken disabled:text-fg-muted"
          disabled={pending}
          type="submit"
        >
          {pending ? <CircleNotch aria-hidden className="bv-spin" size={15} weight="bold" /> : null}
          Verify and return to invite
        </button>
      </form>
    );
  }

  return (
    <form className="mt-5 space-y-3" onSubmit={emailForm.handleSubmit(requestCode)}>
      <label className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {"Invited email "}
        <input
          autoComplete="email"
          className="mt-2 block min-h-11 w-full rounded-[9px] border border-border-strong bg-transparent px-3 font-mono text-[13.5px] font-medium text-fg outline-none focus:border-accent"
          inputMode="email"
          readOnly
          type="email"
          {...emailForm.register("email")}
        />
      </label>
      {emailForm.formState.errors.email ? (
        <p className="m-0 text-[12px] font-medium text-red-text">
          {emailForm.formState.errors.email.message}
        </p>
      ) : null}
      {formError ? <p className="m-0 text-[12px] font-medium text-red-text">{formError}</p> : null}
      <button
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-accent-solid px-4 text-[13px] font-semibold text-primary-contrast hover:opacity-90 disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <CircleNotch aria-hidden className="bv-spin" size={15} weight="bold" />
        ) : (
          <CaretRight aria-hidden size={15} weight="bold" />
        )}
        Send sign-in code
      </button>
    </form>
  );
}
