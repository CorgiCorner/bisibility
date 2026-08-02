"use client";

import {
  disabledOAuthProviders,
  type EnabledOAuthProviders,
  LoginEmailStep,
  type OAuthProvider,
} from "@/components/auth/LoginEmailStep";
import { OtpStep } from "@/components/auth/OtpStep";
import { authClient } from "@/lib/auth/client";
import { resendSignInOtp } from "@/lib/auth/otp-resend";
import { loginErrorReturnTo, mergeReturnToHash } from "@/lib/auth/return-to";
import { signInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import type { SignInCapacity, SignInCapacityMiss } from "@/lib/auth/signin-capacity-types";
import type { LegalConsentLinks } from "@/lib/deployment/legal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { authErrorMessage, isEmailCapacityError } from "./login-errors";
import { emptyOtpDigits, type LoginFormValues, loginSchema } from "./login-schema";

type LoginStep = "email" | "otp";
type AuthStatus = "idle" | "verifying" | "error";

const resendCooldownSeconds = 60;

type LoginFormProps = {
  capacity?: SignInCapacity | null;
  capacityMiss?: SignInCapacityMiss;
  dataResidencyMessage: string;
  /** When the dev fixed-OTP backdoor is on (dev only), the code to surface as a hint. */
  devOtpCode?: string | null;
  /** Dev-only seeded demo account email to prefill + surface as a hint. */
  demoEmail?: string | null;
  enabledProviders?: EnabledOAuthProviders;
  legalConsentLinks: LegalConsentLinks | null;
  returnTo?: string;
};

export function LoginForm({
  capacity = null,
  capacityMiss: initialCapacityMiss = null,
  dataResidencyMessage,
  devOtpCode = null,
  demoEmail = null,
  enabledProviders = disabledOAuthProviders,
  legalConsentLinks,
  returnTo,
}: Readonly<LoginFormProps>) {
  const [step, setStep] = useState<LoginStep>("email");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [socialProvider, setSocialProvider] = useState<OAuthProvider | null>(null);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [capacityMiss, setCapacityMiss] = useState<SignInCapacityMiss>(initialCapacityMiss);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const form = useForm<LoginFormValues>({
    defaultValues: { email: demoEmail ?? "", otp: emptyOtpDigits() },
    mode: "onSubmit",
    resolver: zodResolver(loginSchema),
  });
  const { errors, isSubmitting } = form.formState;
  const isOtpStep = step === "otp";

  function clearCooldown() {
    if (cooldownTimer.current) {
      clearInterval(cooldownTimer.current);
      cooldownTimer.current = null;
    }

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
    if (authStatus !== "error") {
      return;
    }

    setAuthStatus("idle");
    setFormError(null);
    form.clearErrors("otp");
  }

  async function requestCode(values: LoginFormValues) {
    setFormError(null);
    const parsed = loginSchema.pick({ email: true }).safeParse(values);

    if (!parsed.success) {
      form.setError("email", { message: parsed.error.issues[0]?.message });
      return;
    }

    const response = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data.email,
      type: "sign-in",
    });

    if (response.error) {
      if (isEmailCapacityError(response.error)) {
        setCapacityMiss("email");
        return;
      }
      setFormError(authErrorMessage(response.error));
      return;
    }

    resetOtpState();
    setStep("otp");
    startCooldown();
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
    clearCooldown();
    const destination = mergeReturnToHash(returnTo, window.location.hash);
    const redirectUrl = signInRedirectUrl(response, window.location.origin, destination);

    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return;
    }

    window.location.assign(destination);
  }

  async function resendCode() {
    if (cooldownRemaining > 0) {
      return;
    }

    resetOtpState();
    form.setFocus("otp");

    // Server-enforced throttle (Redis/Valkey 1/60s per email, in-memory fallback in dev)
    // so the cooldown cannot be bypassed by reloading; the UI counts down retryAfter.
    const result = await resendSignInOtp(form.getValues("email").trim());

    if (!result.ok) {
      if (result.retryAfter > 0) {
        startCooldown(result.retryAfter);
      }
      setFormError(result.error ?? "Please wait before requesting another code.");
      return;
    }

    startCooldown(result.retryAfter);
  }

  function editEmail() {
    resetOtpState();
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
        dataResidencyMessage={dataResidencyMessage}
        onBack={editEmail}
        onDigitEntry={clearOtpErrorOnDigit}
        onResend={resendCode}
        onSubmit={form.handleSubmit(verifyCode)}
        otpError={errors.otp?.message}
        status={authStatus}
      />
    );
  }

  return (
    <LoginEmailStep
      capacity={capacity}
      capacityMiss={capacityMiss}
      demoEmail={demoEmail}
      dataResidencyMessage={dataResidencyMessage}
      enabledProviders={enabledProviders}
      errors={errors}
      formError={formError}
      isSubmitting={isSubmitting}
      legalConsentLinks={legalConsentLinks}
      onProviderSignIn={(provider) => void signInWithProvider(provider)}
      onSubmit={form.handleSubmit(requestCode)}
      register={form.register}
      socialProvider={socialProvider}
    />
  );
}
