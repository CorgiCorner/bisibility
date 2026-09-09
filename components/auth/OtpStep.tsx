"use client";

import { OtpInput } from "@/components/auth/OtpInput";
import { OtpResendControl } from "@/components/auth/OtpResendControl";
import { Button } from "@/components/ui/Button";
import { DataResidencyNote } from "@/components/ui/DataResidencyNote";
import type { LoginFormValues } from "@/lib/auth/login-schema";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { EnvelopeSimpleOpenIcon as EnvelopeSimpleOpen } from "@phosphor-icons/react/dist/csr/EnvelopeSimpleOpen";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import type { SyntheticEvent } from "react";
import { type Control, Controller, useWatch } from "react-hook-form";

const linkButtonStyle = {
  "--control-color": "var(--fg-muted)",
  fontSize: "13px",
  fontWeight: 600,
  minWidth: 0,
  padding: 0,
} as const;

type AuthStatus = "idle" | "verifying" | "error";

export type OtpStepProps = {
  attempts: number;
  cooldownRemaining: number;
  control: Control<LoginFormValues>;
  dataResidencyMessage: string;
  email: string;
  formError: string | null;
  humanVerificationRequired: boolean;
  onBack: () => void;
  onDigitEntry: () => void;
  onResend: (verificationToken: string | undefined) => Promise<void>;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  otpError?: string;
  resentCode: boolean;
  status: AuthStatus;
  /** Dev-only fixed sign-in code to surface as a hint (null in production). */
  devOtpCode?: string | null;
};

export function OtpStep({
  attempts,
  cooldownRemaining,
  control,
  dataResidencyMessage,
  email,
  formError,
  humanVerificationRequired,
  onBack,
  onDigitEntry,
  onResend,
  onSubmit,
  otpError,
  resentCode,
  status,
  devOtpCode = null,
}: Readonly<OtpStepProps>) {
  const otp = useWatch({ control, name: "otp" }) ?? [];
  const otpComplete = otp.length === 6 && otp.every((digit) => digit !== "");
  const submitting = status === "verifying";
  const showOtpError = status === "error";
  const authErrorMessage =
    attempts >= 3
      ? "Too many attempts. Request a new code to continue."
      : "That code is incorrect or expired. Try again.";

  return (
    <div className="w-full max-w-[380px]">
      <Button
        onClick={onBack}
        startIcon={<ArrowLeft size={15} weight="regular" />}
        style={{ ...linkButtonStyle, paddingInline: "8px" }}
        type="button"
        variant="ghost"
      >
        Back
      </Button>

      <span className="mt-4.5 grid h-[46px] w-[46px] place-items-center rounded-card bg-accent-soft text-accent-solid">
        <EnvelopeSimpleOpen aria-hidden size={23} weight="regular" />
      </span>

      <h1 className="mt-4.5 mb-0 text-[25px] font-semibold tracking-[-0.7px] text-fg">
        Enter your code
      </h1>
      {devOtpCode ? (
        // Demo instances send no email at all, so the "we sent a code" copy would be false.
        <p className="mt-2 mb-0 text-[14px] leading-[1.5] text-fg-muted">
          This demo instance uses a fixed sign-in code for{" "}
          <strong className="font-semibold text-fg">{email}</strong> - no email is sent.
        </p>
      ) : (
        <p className="mt-2 mb-0 text-[14px] leading-[1.5] text-fg-muted">
          We sent a 6-digit code to <strong className="font-semibold text-fg">{email}</strong>. It
          expires in 5 minutes.
        </p>
      )}
      <DataResidencyNote className="mt-4" message={dataResidencyMessage} />

      <form className="mt-6" onSubmit={onSubmit}>
        <Controller
          control={control}
          name="otp"
          render={({ field }) => (
            <OtpInput
              disabled={submitting}
              error={showOtpError || Boolean(otpError)}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              onDigitEntry={onDigitEntry}
              ref={field.ref}
              value={field.value ?? []}
            />
          )}
        />

        {otpError ? <p className="mt-2 mb-0 text-[13px] text-red-text">{otpError}</p> : null}
        {showOtpError ? (
          <div
            aria-live="polite"
            className="mt-[13px] flex items-center gap-2 rounded-control border border-red bg-[color-mix(in_srgb,var(--red)_7%,transparent)] px-3 py-2.5 text-[12.5px] font-medium text-red-text"
          >
            <WarningCircle aria-hidden className="shrink-0" size={16} weight="regular" />
            <span>{authErrorMessage}</span>
          </div>
        ) : null}
        {formError ? <p className="mt-2 mb-0 text-[13px] text-red-text">{formError}</p> : null}

        <Button
          disabled={submitting || !otpComplete}
          fullWidth
          style={{
            borderRadius: UI_RADIUS_ROLES.control,
            fontSize: "14.5px",
            fontWeight: 600,
            marginTop: "16px",
            padding: "12px",
            "--control-disabled-background-color": "var(--bg-sunken)",
            "--control-disabled-border-color": "var(--border)",
            "--control-disabled-color": "var(--fg-muted)",
            "--control-disabled-opacity": 1,
          }}
          type="submit"
          variant="primary"
        >
          {submitting ? "Verifying..." : "Verify and continue"}
        </Button>
      </form>

      {devOtpCode ? (
        // Above the resend row on purpose: on a demo instance without a mailer this hint is
        // the only way to learn the code, so it cannot be the least visible line on the page.
        <p className="mt-3.5 text-center text-[12.5px] text-fg-muted">
          Demo mode &middot; use code{" "}
          <span className="font-semibold text-accent-text">{devOtpCode}</span> to sign in
        </p>
      ) : null}

      {devOtpCode ? null : (
        // With the fixed demo code active no email is sent and resending cannot change the
        // code, so the resend row would only mislead; the hint above replaces it.
        <OtpResendControl
          cooldownRemaining={cooldownRemaining}
          humanVerificationRequired={humanVerificationRequired}
          onResend={onResend}
          resentCode={resentCode}
          submitting={submitting}
        />
      )}
    </div>
  );
}
