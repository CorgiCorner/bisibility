"use client";
import {
  beginTwoFactorEnrollmentAction,
  completeTwoFactorEnrollmentAction,
  disableTwoFactorAction,
  regenerateTwoFactorBackupCodesAction,
} from "@/lib/actions/two-factor";
import { authClient } from "@/lib/auth/client";
import { loginErrorReturnTo } from "@/lib/auth/return-to";
import { notifyAuthenticatedSessionEnd } from "@/lib/auth/session-end";
import type { TwoFactorManagementInput } from "@/lib/auth/two-factor-management-schema";
import { cn } from "@/lib/ui/cn";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccountSection } from "./AccountSection";
import { AuthenticatorSetupForm } from "./AuthenticatorSetupForm";
import { accentButtonClass, feedbackClass, ghostButtonClass } from "./account-ui";
import { BackupCodes } from "./BackupCodes";
import { factorStatusKey } from "./security-factor-utils";
import { TwoFactorManagementForm } from "./TwoFactorManagementForm";
import { createTotpQrDataUrl } from "./totp-qr";

type Mode = "backup" | "disable" | "replace" | "setup";
type SetupData = { enrollmentId: string; qrDataUrl: string | null; secret: string };
type SecurityFactorsProps = {
  hasPasswordCredential: boolean;
  initiallyEnabled: boolean;
  onEnrolled?: () => void;
  returnTo?: string;
};
function managementCopy(mode: Mode, t: ReturnType<typeof useTranslations>) {
  if (mode === "backup") {
    return {
      description: t("manage.backup.description"),
      label: t("manage.backup.label"),
    };
  }
  if (mode === "disable") {
    return {
      description: t("manage.disable.description"),
      label: t("manage.disable.label"),
    };
  }
  if (mode === "replace") {
    return {
      description: t("manage.replace.description"),
      label: t("manage.replace.label"),
    };
  }
  return {
    description: t("manage.setup.description"),
    label: t("manage.setup.label"),
  };
}
export function SecurityFactors({
  hasPasswordCredential,
  initiallyEnabled,
  onEnrolled,
  returnTo = "/app/account/security",
}: Readonly<SecurityFactorsProps>) {
  const router = useRouter();
  const t = useTranslations("account.security.twoFactor");
  const [mode, setMode] = useState<Mode | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, setPending] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
        setMessage(t(result.error.code === "session_not_fresh" ? "reauthRequired" : "updateError"));
        setReauthRequired(result.error.code === "session_not_fresh");
        return;
      }
      const { enrollmentId, secret, totpURI } = result.value;
      setSetup({
        enrollmentId,
        qrDataUrl: createTotpQrDataUrl(totpURI),
        secret,
      });
      setMessage(t("scanAndVerify"));
      return;
    }
    if (mode === "backup") {
      const result = await regenerateTwoFactorBackupCodesAction(values);
      if (!result.ok) {
        setMessage(
          t(result.error.code === "step_up_failed" ? "verificationFailed" : "updateError"),
        );
        return;
      }
      setBackupCodes(result.value.backupCodes);
      setMode(null);
      setMessage(t("backupCodesGenerated"));
      return;
    }
    if (mode === "disable") {
      const result = await disableTwoFactorAction(values);
      if (!result.ok) {
        setMessage(
          t(result.error.code === "step_up_failed" ? "verificationFailed" : "updateError"),
        );
        return;
      }
      notifyAuthenticatedSessionEnd();
      setEnabled(false);
      setMode(null);
      setMessage(t("disabledRedirecting"));
      router.replace("/login");
      router.refresh();
    }
  }
  async function reauthenticate() {
    setPending(true);
    setMessage(null);
    try {
      await authClient.signOut();
      notifyAuthenticatedSessionEnd();
      router.replace(loginErrorReturnTo(returnTo));
      router.refresh();
    } catch {
      setMessage(t("signOutError"));
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
        setMessage(t("updateError"));
        return;
      }
      setEnabled(true);
      setBackupCodes(result.value.backupCodes);
      setSetup(null);
      setMode(null);
      setMessage(result.value.replaced ? t("replaced") : t("enabled"));
      if (!onEnrolled) router.refresh();
    } catch {
      setMessage(t("verifyError"));
    } finally {
      setPending(false);
    }
  }
  const copy = mode ? managementCopy(mode, t) : null;
  return (
    <AccountSection
      contentClassName="px-4.5 py-4"
      description={t("description")}
      title={t("title")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-[13px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-bg-sunken text-fg-muted">
            {enabled ? (
              <ShieldCheck size={18} weight="regular" />
            ) : (
              <DeviceMobile size={18} weight="regular" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-fg">
              {t("authenticatorApp")}
            </span>
            <span className="block text-[11.5px] text-fg-muted">{t(factorStatusKey(enabled))}</span>
          </span>
          {enabled ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button className={ghostButtonClass} onClick={() => openMode("backup")} type="button">
                {t("backupCodes")}
              </button>
              <button
                className={ghostButtonClass}
                onClick={() => openMode("replace")}
                type="button"
              >
                {t("replaceAuthenticator")}
              </button>
              <button
                className={ghostButtonClass}
                onClick={() => openMode("disable")}
                type="button"
              >
                {t("disable")}
              </button>
            </div>
          ) : (
            <button className={accentButtonClass} onClick={() => openMode("setup")} type="button">
              {t("enable")}
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
          <AuthenticatorSetupForm
            onCancel={() => setSetup(null)}
            onSubmit={verifyNewAuthenticator}
            pending={pending}
            qrDataUrl={setup.qrDataUrl}
            secret={setup.secret}
          />
        ) : null}
        {onEnrolled && backupCodes.length > 0 ? (
          <button
            className={accentButtonClass}
            onClick={() => {
              onEnrolled();
              router.refresh();
            }}
            type="button"
          >
            {t("continueToMail")}
          </button>
        ) : null}
        <BackupCodes codes={backupCodes} />
        {reauthRequired ? (
          <button
            className={accentButtonClass}
            disabled={pending}
            onClick={reauthenticate}
            type="button"
          >
            {pending ? t("signingOut") : t("signInAgain")}
          </button>
        ) : null}
        {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
      </div>
    </AccountSection>
  );
}
