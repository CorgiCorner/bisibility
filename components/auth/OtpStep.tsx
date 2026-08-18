"use client";

import { OtpInput } from "@/components/auth/OtpInput";
import { DataResidencyNote } from "@/components/ui";
import Button from "@mui/material/Button";
import {
  ArrowLeftIcon as ArrowLeft,
  CaretRightIcon as CaretRight,
  CircleNotchIcon as CircleNotch,
  EnvelopeSimpleOpenIcon as EnvelopeSimpleOpen,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { SyntheticEvent } from "react";
import { type Control, Controller, useWatch } from "react-hook-form";
import type { LoginFormValues } from "./login-schema";

const linkButtonSx = {
  color: "var(--fg-muted)",
  fontSize: "13px",
  fontWeight: 600,
  minWidth: 0,
  padding: 0,
} as const;

/**
 * Widest label the resend control can show. The grid overlay below reserves
 * this width so neither consecutive second ticks (tabular numerals keep digit
 * width constant) nor the swap to "Resend code" shifts any row element.
 */
const resendReferenceLabel = "Resend in 1:00";

type AuthStatus = "idle" | "verifying" | "error";

export type OtpStepProps = {
  attempts: number;
  cooldownRemaining: number;
  control: Control<LoginFormValues>;
  dataResidencyMessage: string;
  email: string;
  formError: string | null;
  onBack: () => void;
  onDigitEntry: () => void;
  onResend: () => Promise<void>;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  otpError?: string;
  status: AuthStatus;
  /** Dev-only fixed sign-in code to surface as a hint (null in production). */
  devOtpCode?: string | null;
};

function formatCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function OtpStep({
  attempts,
  cooldownRemaining,
  control,
  dataResidencyMessage,
  email,
  formError,
  onBack,
  onDigitEntry,
  onResend,
  onSubmit,
  otpError,
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
  const resendDisabled = submitting || cooldownRemaining > 0;

  return (
    <div className="w-full max-w-[380px]">
      <Button
        color="inherit"
        onClick={onBack}
        startIcon={<ArrowLeft size={15} weight="bold" />}
        sx={linkButtonSx}
        type="button"
      >
        Back
      </Button>

      <span className="mt-4.5 grid h-[46px] w-[46px] place-items-center rounded-xl bg-accent-soft text-accent-text">
        <EnvelopeSimpleOpen aria-hidden size={23} weight="fill" />
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
            className="mt-[13px] flex items-center gap-2 rounded-[10px] border border-red bg-[color-mix(in_srgb,var(--red)_7%,transparent)] px-3 py-2.5 text-[12.5px] font-medium text-red-text"
          >
            <WarningCircle aria-hidden className="shrink-0" size={16} weight="fill" />
            <span>{authErrorMessage}</span>
          </div>
        ) : null}
        {formError ? <p className="mt-2 mb-0 text-[13px] text-red-text">{formError}</p> : null}

        <Button
          disabled={submitting || !otpComplete}
          fullWidth
          startIcon={
            submitting ? (
              <CircleNotch aria-hidden className="bv-spin" size={16} weight="bold" />
            ) : (
              <CaretRight aria-hidden size={16} weight="bold" />
            )
          }
          sx={{
            borderRadius: "10px",
            fontSize: "14.5px",
            fontWeight: 600,
            marginTop: "16px",
            padding: "12px",
            "&.Mui-disabled": {
              backgroundColor: "var(--bg-sunken)",
              borderColor: "var(--border-strong)",
              color: "var(--fg-muted)",
              opacity: 1,
            },
          }}
          type="submit"
          variant="contained"
        >
          {submitting ? "Verifying..." : "Verify & continue"}
        </Button>
      </form>

      {devOtpCode ? (
        // Above the resend row on purpose: on a demo instance without a mailer this hint is
        // the only way to learn the code, so it cannot be the least visible line on the page.
        <p className="mt-3.5 text-center font-mono text-[12.5px] text-fg-muted">
          Demo mode &middot; use code{" "}
          <span className="font-semibold text-accent-text">{devOtpCode}</span> to sign in
        </p>
      ) : null}

      {devOtpCode ? null : (
        // With the fixed demo code active no email is sent and resending cannot change the
        // code, so the resend row would only mislead; the hint above replaces it.
        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[13px] text-fg-muted">
          Didn&apos;t get it?
          <Button
            color="inherit"
            disabled={resendDisabled}
            onClick={() => {
              void onResend();
            }}
            sx={{
              ...linkButtonSx,
              color: "var(--accent-text)",
              fontVariantNumeric: "tabular-nums",
            }}
            type="button"
          >
            <span style={{ display: "grid" }}>
              <span
                aria-hidden
                style={{
                  gridArea: "1 / 1",
                  visibility: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {resendReferenceLabel}
              </span>
              <span style={{ gridArea: "1 / 1", whiteSpace: "nowrap" }}>
                {cooldownRemaining > 0
                  ? `Resend in ${formatCooldown(cooldownRemaining)}`
                  : "Resend code"}
              </span>
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
