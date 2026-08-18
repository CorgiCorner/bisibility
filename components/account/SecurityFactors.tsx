"use client";

import {
  beginTwoFactorEnrollmentAction,
  completeTwoFactorEnrollmentAction,
  disableTwoFactorAction,
  regenerateTwoFactorBackupCodesAction,
} from "@/lib/actions/two-factor";
import { authClient } from "@/lib/auth/client";
import { loginErrorReturnTo } from "@/lib/auth/return-to";
import type { TwoFactorManagementInput } from "@/lib/auth/two-factor-management-schema";
import { completeTwoFactorEnrollmentSchema } from "@/lib/auth/two-factor-management-schema";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import {
  DeviceMobileIcon as DeviceMobile,
  ShieldCheckIcon as ShieldCheck,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AccountSection } from "./AccountSection";
import {
  accentButtonClass,
  feedbackClass,
  fieldInputClass,
  fieldLabelClass,
  fieldValueClass,
  ghostButtonClass,
} from "./account-ui";
import { BackupCodes } from "./BackupCodes";
import { factorStatusLabel } from "./security-factor-utils";
import { TwoFactorManagementForm } from "./TwoFactorManagementForm";
import { createTotpQrDataUrl } from "./totp-qr";

type Mode = "backup" | "disable" | "replace" | "setup";
type SetupData = {
  enrollmentId: string;
  qrDataUrl: string | null;
  secret: string;
};

type SecurityFactorsProps = {
  hasPasswordCredential: boolean;
  initiallyEnabled: boolean;
};

function managementCopy(mode: Mode) {
  if (mode === "backup") {
    return {
      description: "Verify a current factor before replacing every existing backup code.",
      label: "Generate new backup codes",
    };
  }
  if (mode === "disable") {
    return {
      description:
        "Verify a current factor before removing 2FA. You will be signed out on every device.",
      label: "Disable two-factor authentication",
    };
  }
  if (mode === "replace") {
    return {
      description: "Verify a current factor before replacing the authenticator app.",
      label: "Continue",
    };
  }
  return {
    description: "For security, initial enrollment requires a sign-in from the last five minutes.",
    label: "Continue",
  };
}

export function SecurityFactors({
  hasPasswordCredential,
  initiallyEnabled,
}: Readonly<SecurityFactorsProps>) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, setPending] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const verificationForm = useForm<{ code: string }>({
    defaultValues: { code: "" },
    mode: "onSubmit",
    resolver: zodResolver(completeTwoFactorEnrollmentSchema.pick({ code: true })),
  });

  function openMode(nextMode: Mode) {
    setMode((current) => (current === nextMode ? null : nextMode));
    setSetup(null);
    setMessage(null);
    setReauthRequired(false);
    setBackupCodes([]);
  }

  async function runManagementAction(values: TwoFactorManagementInput) {
    setMessage(null);
    if (mode === "setup" || mode === "replace") {
      const result = await beginTwoFactorEnrollmentAction(values);
      if (!result.ok) {
        setMessage(result.error.message);
        setReauthRequired(result.error.code === "session_not_fresh");
        return;
      }
      const { enrollmentId, secret, totpURI } = result.value;
      setSetup({
        enrollmentId,
        qrDataUrl: createTotpQrDataUrl(totpURI),
        secret,
      });
      verificationForm.reset({ code: "" });
      setMessage("Scan the QR code and verify the new authenticator.");
      return;
    }
    if (mode === "backup") {
      const result = await regenerateTwoFactorBackupCodesAction(values);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setBackupCodes(result.value.backupCodes);
      setMode(null);
      setMessage("New backup codes generated. Save them now.");
      return;
    }
    if (mode === "disable") {
      const result = await disableTwoFactorAction(values);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setEnabled(false);
      setMode(null);
      setMessage("Two-factor authentication disabled. Redirecting to sign in.");
      router.replace("/login");
      router.refresh();
    }
  }

  async function reauthenticate() {
    setPending(true);
    setMessage(null);
    try {
      await authClient.signOut();
      router.replace(loginErrorReturnTo("/app/account/security"));
      router.refresh();
    } catch {
      setMessage("Sign-out failed. Refresh the page and try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyNewAuthenticator(values: { code: string }) {
    if (!setup) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await completeTwoFactorEnrollmentAction({
        code: values.code,
        enrollmentId: setup.enrollmentId,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setEnabled(true);
      setBackupCodes(result.value.backupCodes);
      setSetup(null);
      setMode(null);
      setMessage(
        result.value.replaced
          ? "Authenticator replaced. Save the new backup codes."
          : "Two-factor authentication enabled. Save the backup codes.",
      );
      router.refresh();
    } catch {
      setMessage("The authenticator could not be verified. Try again.");
    } finally {
      setPending(false);
    }
  }

  const copy = mode ? managementCopy(mode) : null;
  return (
    <AccountSection
      contentClassName="px-4.5 py-4"
      description="Add a second step after the email login code."
      title="Two-factor authentication"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-[13px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-bg-sunken text-fg-muted">
            {enabled ? <ShieldCheck size={18} /> : <DeviceMobile size={18} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-fg">Authenticator app</span>
            <span className="block text-[11.5px] text-fg-muted">{factorStatusLabel(enabled)}</span>
          </span>
          {enabled ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button className={ghostButtonClass} onClick={() => openMode("backup")} type="button">
                Backup codes
              </button>
              <button
                className={ghostButtonClass}
                onClick={() => openMode("replace")}
                type="button"
              >
                Replace authenticator
              </button>
              <button
                className={ghostButtonClass}
                onClick={() => openMode("disable")}
                type="button"
              >
                Disable
              </button>
            </div>
          ) : (
            <button className={accentButtonClass} onClick={() => openMode("setup")} type="button">
              Enable
            </button>
          )}
        </div>

        {mode && !setup && copy ? (
          <TwoFactorManagementForm
            description={copy.description}
            factorRequired={enabled}
            hasPasswordCredential={hasPasswordCredential}
            onCancel={() => setMode(null)}
            onError={setMessage}
            onSubmit={runManagementAction}
            submitLabel={copy.label}
            variant={mode === "disable" ? "destructive" : "primary"}
          />
        ) : null}

        {setup ? (
          <form
            className="grid gap-4"
            onSubmit={verificationForm.handleSubmit(verifyNewAuthenticator)}
          >
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              {setup.qrDataUrl ? (
                // biome-ignore lint/performance/noImgElement: The generated QR code is an in-memory data URI.
                <img
                  alt="Authenticator app QR code"
                  className="h-[180px] w-[180px] rounded-[12px] border border-border-strong bg-white p-2"
                  src={setup.qrDataUrl}
                />
              ) : (
                <span className={cn(fieldValueClass, "h-[180px] text-center text-fg-muted")}>
                  QR unavailable
                </span>
              )}
              <div className="grid content-start gap-3">
                <div className={fieldLabelClass}>
                  {"Secret "}
                  <span className={cn(fieldValueClass, "break-all font-mono")}>{setup.secret}</span>
                </div>
                <label className={fieldLabelClass}>
                  {"New authenticator code "}
                  <input
                    autoComplete="one-time-code"
                    className={fieldInputClass}
                    inputMode="numeric"
                    maxLength={6}
                    {...verificationForm.register("code")}
                  />
                  {verificationForm.formState.errors.code ? (
                    <span className={cn(feedbackClass, "text-red-text")}>
                      {verificationForm.formState.errors.code.message}
                    </span>
                  ) : null}
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={accentButtonClass} disabled={pending} type="submit">
                {pending ? "Verifying" : "Verify"}
              </button>
              <button className={ghostButtonClass} onClick={() => setSetup(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <BackupCodes codes={backupCodes} />
        {reauthRequired ? (
          <button
            className={accentButtonClass}
            disabled={pending}
            onClick={reauthenticate}
            type="button"
          >
            {pending ? "Signing out" : "Sign in again"}
          </button>
        ) : null}
        {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
      </div>
    </AccountSection>
  );
}
