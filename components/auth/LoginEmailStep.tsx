"use client";

import type { LoginFormValues } from "@/components/auth/login-schema";
import {
  CapacityMeter,
  EmailCapacityPanel,
  FullCapacityCard,
  GoogleCapacityNote,
} from "@/components/auth/SignInCapacity";
import { DataResidencyNote } from "@/components/ui";
import type { SignInCapacity, SignInCapacityMiss } from "@/lib/auth/signin-capacity-types";
import type { LegalConsentLinks } from "@/lib/deployment/legal";
import Button from "@mui/material/Button";
import {
  CaretRightIcon as CaretRight,
  GithubLogoIcon as GithubLogo,
  GoogleLogoIcon as GoogleLogo,
} from "@phosphor-icons/react";
import type { SyntheticEvent } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

const oauthProviders = [
  { icon: GithubLogo, label: "Continue with GitHub", provider: "github" },
  { icon: GoogleLogo, label: "Continue with Google", provider: "google" },
] as const;

export type OAuthProvider = (typeof oauthProviders)[number]["provider"];
export type EnabledOAuthProviders = Readonly<Record<OAuthProvider, boolean>>;

export const disabledOAuthProviders: EnabledOAuthProviders = {
  github: false,
  google: false,
};

type LoginEmailStepProps = {
  capacity?: SignInCapacity | null;
  capacityMiss?: SignInCapacityMiss;
  dataResidencyMessage: string;
  demoEmail?: string | null;
  enabledProviders: EnabledOAuthProviders;
  errors: FieldErrors<LoginFormValues>;
  formError: string | null;
  isSubmitting: boolean;
  legalConsentLinks: LegalConsentLinks | null;
  onProviderSignIn: (provider: OAuthProvider) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  register: UseFormRegister<LoginFormValues>;
  socialProvider: OAuthProvider | null;
};

function ConsentLink({ href, label }: Readonly<{ href: string; label: string }>) {
  const external = /^https?:\/\//i.test(href);

  return (
    <a
      className="text-fg-muted underline-offset-2 hover:underline"
      href={href}
      {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
    >
      {label}
    </a>
  );
}

/**
 * One consent sentence, not several. The beta-email clause is folded in here because
 * "By continuing" and "By joining" were the same agreement stated twice, competing for
 * attention directly under the call to action.
 */
function LegalConsent({
  links,
  includeBetaEmails = false,
}: Readonly<{ links: LegalConsentLinks | null; includeBetaEmails?: boolean }>) {
  if (!links || (!links.termsHref && !links.privacyHref)) {
    return null;
  }

  const betaEmails = includeBetaEmails ? ", and to beta emails (updates, incidents, pricing)" : "";

  return (
    <p className="mt-[22px] mb-0 text-center text-xs leading-[1.6] text-fg-muted">
      {links.termsHref && links.privacyHref ? (
        <>
          By continuing you agree to the <ConsentLink href={links.termsHref} label="Terms" /> and{" "}
          <ConsentLink href={links.privacyHref} label="Privacy Policy" />
          {betaEmails}.
        </>
      ) : null}
      {links.termsHref && !links.privacyHref ? (
        <>
          By continuing you agree to the <ConsentLink href={links.termsHref} label="Terms" />
          {betaEmails}.
        </>
      ) : null}
      {!links.termsHref && links.privacyHref ? (
        <>
          By continuing you agree to the{" "}
          <ConsentLink href={links.privacyHref} label="Privacy Policy" />
          {betaEmails}.
        </>
      ) : null}
    </p>
  );
}

export function getEnabledOAuthProviders(enabledProviders: EnabledOAuthProviders) {
  return oauthProviders.filter(({ provider }) => enabledProviders[provider]);
}

export function LoginEmailStep({
  capacity = null,
  capacityMiss = null,
  dataResidencyMessage,
  demoEmail = null,
  enabledProviders,
  errors,
  formError,
  isSubmitting,
  legalConsentLinks,
  onProviderSignIn,
  onSubmit,
  register,
  socialProvider,
}: Readonly<LoginEmailStepProps>) {
  const enabledOAuthProviders = getEnabledOAuthProviders(enabledProviders);
  const hasOAuthSection = enabledOAuthProviders.length > 0;
  const googleFull =
    enabledProviders.google &&
    (capacityMiss === "google" || (capacity !== null && capacity.googleSpots.left === 0));
  const emailFull =
    capacity?.emailCodes !== null &&
    capacity?.emailCodes !== undefined &&
    (capacityMiss === "email" || capacity.emailCodes.left === 0);
  const allFull = googleFull && emailFull;
  const emailBinding = capacity?.emailCodes?.binding ?? "daily";

  const consent = <LegalConsent includeBetaEmails={Boolean(capacity)} links={legalConsentLinks} />;

  if (allFull) {
    return (
      <div className="w-full max-w-[380px]">
        <FullCapacityCard emailBinding={emailBinding} />
        {consent}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.7px] text-fg">
        Sign in or create an account
      </h1>
      <p className="mt-2 mb-0 text-[14px] text-fg-muted">
        Use your work email. We&apos;ll send a one-time code, no password to remember.
      </p>
      <DataResidencyNote className="mt-4" message={dataResidencyMessage} />

      {hasOAuthSection ? (
        <>
          <div className="mt-[26px] flex flex-col gap-[9px]">
            {enabledOAuthProviders.map(({ icon: Icon, label, provider }) => {
              const isDisabled = socialProvider !== null;
              const button = (
                <Button
                  color="inherit"
                  disabled={isDisabled}
                  key={provider}
                  onClick={() => onProviderSignIn(provider)}
                  startIcon={<Icon size={18} weight="fill" />}
                  sx={{
                    backgroundColor: "var(--bg-elev)",
                    borderColor: "var(--border-strong)",
                    borderRadius: "10px",
                    color: "var(--fg)",
                    fontSize: "14px",
                    fontWeight: 600,
                    padding: "11px",
                    "&:hover": { borderColor: "var(--fg-muted)" },
                  }}
                  type="button"
                  variant="outlined"
                  {...(provider === "google" && capacity ? { fullWidth: true } : {})}
                >
                  {label}
                </Button>
              );

              if (provider !== "google" || !capacity) {
                return button;
              }

              return (
                <div key={provider}>
                  {button}
                  {googleFull ? (
                    <GoogleCapacityNote justMissed={capacityMiss === "google"} />
                  ) : (
                    <CapacityMeter
                      compact
                      label={`${capacity.googleSpots.left} of ${capacity.googleSpots.cap} Google sign-up spots left`}
                      meter={capacity.googleSpots}
                      tooltip="Google sign-in is limited while Google reviews our verification request."
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="my-5 flex items-center gap-3 font-mono text-[11px] text-fg-muted">
            <span className="h-px flex-1 bg-border" />
            {"OR "}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {/* Without the provider block above, this section would butt against the residency note. */}
      <div className={hasOAuthSection ? undefined : "mt-[26px]"} data-testid="login-email-section">
        {emailFull ? (
          <EmailCapacityPanel binding={emailBinding} justMissed={capacityMiss === "email"} />
        ) : (
          <form onSubmit={onSubmit}>
            <label
              className="block font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-muted"
              htmlFor="login-email"
            >
              Email
            </label>
            <input
              autoComplete="email"
              className="mt-[7px] box-border w-full rounded-[10px] border border-border-strong bg-transparent px-[13px] py-3 font-mono text-[14.5px] font-medium text-fg outline-none focus:border-accent"
              disabled={isSubmitting}
              id="login-email"
              inputMode="email"
              placeholder="you@company.com"
              type="email"
              {...register("email")}
            />
            {errors.email ? (
              <p className="mt-2 mb-0 text-[13px] text-red-text">{errors.email.message}</p>
            ) : null}
            {formError ? <p className="mt-2 mb-0 text-[13px] text-red-text">{formError}</p> : null}

            <Button
              disabled={isSubmitting}
              endIcon={<CaretRight size={16} weight="bold" />}
              fullWidth
              sx={{
                borderRadius: "10px",
                fontSize: "14.5px",
                fontWeight: 600,
                marginTop: "14px",
                padding: "12px",
              }}
              type="submit"
              variant="contained"
            >
              Send login code
            </Button>
            {capacity?.emailCodes ? (
              <CapacityMeter
                label={`${capacity.emailCodes.left} of ${capacity.emailCodes.cap} login codes left ${
                  capacity.emailCodes.binding === "monthly" ? "this month" : "today"
                }`}
                meter={capacity.emailCodes}
                tooltip={
                  capacity.emailCodes.binding === "monthly"
                    ? "Monthly email volume is capped. Capacity resets at the start of next month (UTC)."
                    : "Daily email volume is capped. Capacity frees up continuously over 24 hours."
                }
              />
            ) : null}
          </form>
        )}
      </div>

      {demoEmail ? (
        <p className="mt-3.5 mb-0 text-center font-mono text-[11.5px] text-fg-muted">
          <span className="font-semibold text-accent-text">Try the demo</span> &middot; {demoEmail}{" "}
          &middot; code 000000
        </p>
      ) : null}

      {consent}
    </div>
  );
}
