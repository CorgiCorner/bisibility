"use client";

import {
  disabledOAuthProviders,
  type EnabledOAuthProviders,
  LoginEmailStep,
  type OAuthProvider,
} from "@/components/auth/LoginEmailStep";
import { OtpStep } from "@/components/auth/OtpStep";
import { authClient } from "@/lib/auth/client";
import { emptyOtpDigits, type LoginFormValues, loginSchema } from "@/lib/auth/login-schema";
import { resendSignInOtp } from "@/lib/auth/otp-resend";
import type { RequestLoginCodeResult } from "@/lib/auth/request-login-code";
import { requestLoginCode } from "@/lib/auth/request-login-code";
import { loginErrorReturnTo, mergeReturnToHash } from "@/lib/auth/return-to";
import { signInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import type { SignInCapacity, SignInCapacityMiss } from "@/lib/auth/signin-capacity-types";
import type { LegalConsentLinks } from "@/lib/deployment/legal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { waitlistFailureMessage } from "@/lib/ui/action-error";
import { useHumanVerification } from "@/lib/verification/human-verification-client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { authErrorMessage, isEmailCapacityError } from "./login-errors";

type LoginStep = "email" | "otp";
type AuthStatus = "idle" | "verifying" | "error";

const resendCooldownSeconds = 60;

type LoginFormProps = {
  capacity?: SignInCapacity | null;
  capacityMiss?: SignInCapacityMiss;
  dataResidencyMessage: string;
  devOtpCode?: string | null;
  demoEmail?: string | null;
  emailSignInUnavailable?: boolean;
  enabledProviders?: EnabledOAuthProviders;
  humanVerificationRequired?: boolean;
  legalConsentLinks: LegalConsentLinks | null;
  returnTo?: string;
};

export function LoginForm({
  capacity = null,
  capacityMiss: initialCapacityMiss = null,
  dataResidencyMessage,
  devOtpCode = null,
  demoEmail = null,
  emailSignInUnavailable = false,
  enabledProviders = disabledOAuthProviders,
  humanVerificationRequired = false,
  legalConsentLinks,
  returnTo,
}: Readonly<LoginFormProps>) {
  const verification = useHumanVerification();
  const [emailStepKey, setEmailStepKey] = useState(0);
  const [step, setStep] = useState<LoginStep>("email");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [socialProvider, setSocialProvider] = useState<OAuthProvider | null>(null);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [resentCode, setResentCode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capacityMiss, setCapacityMiss] = useState<SignInCapacityMiss>(initialCapacityMiss);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const form = useForm<LoginFormValues>({
    defaultValues: { email: demoEmail ?? "", otp: emptyOtpDigits(), verificationToken: undefined },
    mode: "onSubmit",
    resolver: zodResolver(loginSchema),
  });
  const { errors, isSubmitting } = form.formState;
  const isOtpStep = step === "otp";

  function clearCooldown() {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = null;
    setCooldownRemaining(0);
  }

  function startCooldown(seconds = resendCooldownSeconds) {
    clearCooldown();
    setCooldownRemaining(seconds);
    cooldownTimer.current = setInterval(() => {
      setCooldownRemaining((current) => {
        if (current <= 1) {
          if (cooldownTimer.current) {
            clearInterval(cooldownTimer.current);
            cooldownTimer.current = null;
          }

          return 0;
        }

        return current - 1;
      });
    }, 1000);
  }

  function resetOtpState() {
    setAuthStatus("idle");
    setAuthAttempts(0);
    setFormError(null);
    form.clearErrors("otp");
    form.setValue("otp", emptyOtpDigits(), { shouldDirty: true, shouldValidate: false });
  }

  function handleOtpFailure() {
    setFormError(null);
    setAuthStatus("error");
    setAuthAttempts((attempts) => attempts + 1);
    form.clearErrors("otp");
    form.setValue("otp", emptyOtpDigits(), { shouldDirty: true, shouldValidate: false });
    form.setFocus("otp");
  }

  function clearOtpErrorOnDigit() {
    if (authStatus !== "error") return;
    setAuthStatus("idle");
    setFormError(null);
    form.clearErrors("otp");
  }

  async function requestCode(values: LoginFormValues) {
    setFormError(null);
    const result = await requestLoginCode({
      email: values.email,
      verificationToken: humanVerificationRequired ? (verification.token ?? undefined) : undefined,
    }).catch((): RequestLoginCodeResult => ({ code: "delivery_failed", ok: false }));
    verification.reset();

    if (result.ok) {
      resetOtpState();
      setResentCode(false);
      setStep("otp");
      startCooldown();
      return;
    }
    if (isEmailCapacityError({ code: result.code })) {
      setCapacityMiss("email");
    } else if (result.code === "verification_failed" || result.code === "rate_limited") {
      setFormError(waitlistFailureMessage(result.code));
    } else if (result.code === "EMAIL_NOT_CONFIGURED") {
      setFormError(authErrorMessage({ code: result.code }));
    } else {
      setFormError("Could not send a login code. Try again.");
    }
    setEmailStepKey((key) => key + 1);
  }

  async function signInWithProvider(provider: OAuthProvider) {
    if (socialProvider) {
      return;
    }

    if (!enabledProviders[provider]) {
      setFormError("This sign-in method is not configured.");
      return;
    }

    setSocialProvider(provider);
    setFormError(null);

    try {
      const destination = mergeReturnToHash(returnTo, window.location.hash);
      const response = await authClient.signIn.social({
        provider,
        callbackURL: destination,
        errorCallbackURL: loginErrorReturnTo(destination),
      });

      if (response.error) {
        setFormError(authErrorMessage(response.error));
      }
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSocialProvider(null);
    }
  }

  async function verifyCode(values: LoginFormValues) {
    setFormError(null);
    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === "email" || field === "otp") {
          form.setError(field, { message: issue.message });
        }
      }
      return;
    }

    const otp = parsed.data.otp.join("");

    if (!/^\d{6}$/.test(otp)) {
      form.setError("otp", { message: "Enter the 6-digit code." });
      return;
    }

    setAuthStatus("verifying");
    const response = await authClient.signIn.emailOtp({
      email: parsed.data.email,
      otp,
    });

    if (response.error) {
      handleOtpFailure();
      return;
    }

    setAuthStatus("idle");
    setResentCode(false);
    clearCooldown();
    const destination = mergeReturnToHash(returnTo, window.location.hash);
    const redirectUrl = signInRedirectUrl(response, window.location.origin, destination);

    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return;
    }

    window.location.assign(destination);
  }

  async function resendCode(verificationToken: string | undefined) {
    if (cooldownRemaining > 0) return;
    resetOtpState();
    form.setFocus("otp");

    const result = await resendSignInOtp({
      email: form.getValues("email").trim(),
      verificationToken,
    });

    if (!result.ok) {
      setResentCode(false);
      if (result.retryAfter > 0) {
        startCooldown(result.retryAfter);
      }
      if (result.code === "verification_failed") {
        setFormError("Verification failed. Please try again.");
      } else if (result.code === "rate_limited") {
        setFormError("Too many requests. Please try again later.");
      } else if (result.code === "capacity_exhausted") {
        setFormError("Email sign-in capacity is temporarily full. Try again later.");
      } else if (result.code === "EMAIL_NOT_CONFIGURED") {
        setFormError(authErrorMessage({ code: result.code }));
      } else {
        setFormError("Could not send a new code. Try again.");
      }
      return;
    }

    setResentCode(true);
    startCooldown(result.retryAfter);
  }

  function editEmail() {
    resetOtpState();
    setResentCode(false);
    clearCooldown();
    setStep("email");
  }

  if (isOtpStep) {
    return (
      <OtpStep
        attempts={authAttempts}
        cooldownRemaining={cooldownRemaining}
        control={form.control}
        devOtpCode={devOtpCode}
        email={form.getValues("email").trim()}
        formError={formError}
        humanVerificationRequired={humanVerificationRequired}
        dataResidencyMessage={dataResidencyMessage}
        onBack={editEmail}
        onDigitEntry={clearOtpErrorOnDigit}
        onResend={resendCode}
        onSubmit={form.handleSubmit(verifyCode)}
        otpError={errors.otp?.message}
        resentCode={resentCode}
        status={authStatus}
      />
    );
  }

  return (
    <LoginEmailStep
      key={emailStepKey}
      capacity={capacity}
      capacityMiss={capacityMiss}
      demoEmail={demoEmail}
      dataResidencyMessage={dataResidencyMessage}
      emailSignInUnavailable={emailSignInUnavailable}
      enabledProviders={enabledProviders}
      errors={errors}
      formError={formError}
      humanVerificationField={humanVerificationRequired ? verification.field : null}
      isSubmitting={isSubmitting}
      legalConsentLinks={legalConsentLinks}
      onProviderSignIn={(provider) => void signInWithProvider(provider)}
      onSubmit={form.handleSubmit(requestCode)}
      register={form.register}
      verificationReady={!humanVerificationRequired || verification.ok}
      socialProvider={socialProvider}
    />
  );
}
