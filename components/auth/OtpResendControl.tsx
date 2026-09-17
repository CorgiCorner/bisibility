"use client";

import { Button } from "@/components/ui/Button";
import { useHumanVerification } from "@/lib/verification/human-verification-client";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

const linkButtonStyle = {
  "--control-background-color": "transparent",
  "--control-border": "none",
  "--control-color": "var(--fg)",
  fontSize: "13px",
  fontWeight: 600,
  minWidth: 0,
  padding: 0,
} as const;

function formatCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

type OtpResendControlProps = {
  cooldownRemaining: number;
  humanVerificationRequired: boolean;
  onResend: (verificationToken: string | undefined) => Promise<void>;
  resentCode: boolean;
  submitting: boolean;
};

export function OtpResendControl({
  cooldownRemaining,
  humanVerificationRequired,
  onResend,
  resentCode,
  submitting,
}: Readonly<OtpResendControlProps>) {
  const t = useTranslations("auth.otp");
  const verification = useHumanVerification();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const verificationReady = !humanVerificationRequired || verification.ok;
  const disabled = submitting || pending || cooldownRemaining > 0 || !verificationReady;

  async function resend() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await onResend(humanVerificationRequired ? (verification.token ?? undefined) : undefined);
    } finally {
      verification.reset();
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-3.5">
      {humanVerificationRequired && cooldownRemaining === 0 ? (
        <div className="mb-2.5">{verification.field}</div>
      ) : null}
      <div className="flex items-center justify-center gap-1.5 text-[13px] text-fg-muted">
        {resentCode ? t("resent") : t("tryAgain")}
        <Button
          disabled={disabled}
          onClick={() => void resend()}
          style={{
            ...linkButtonStyle,
            fontVariantNumeric: "tabular-nums",
            minHeight: "36px",
            "--control-text-decoration": "none",
            "--control-hover-background-color": "transparent",
            "--control-hover-text-decoration": "underline",
            "--control-hover-text-decoration-color": "var(--fg)",
            "--control-hover-text-underline-offset": "3px",
            "--control-focus-outline": "2px solid var(--border-control)",
            "--control-focus-outline-offset": "2px",
            "--control-focus-text-decoration": "underline",
            "--control-focus-text-underline-offset": "3px",
            "--control-disabled-background-color": "transparent",
            "--control-disabled-border": "none",
            "--control-disabled-color": "var(--fg-muted)",
            "--control-disabled-opacity": 1,
            "--control-disabled-text-decoration": "none",
          }}
          type="button"
        >
          <span style={{ display: "grid" }}>
            <span
              aria-hidden
              style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}
            >
              {t("resendReference", {
                label: t("resendAgainIn", { time: "1:00" }),
                status: t("resent"),
              })}
            </span>
            <span style={{ gridArea: "1 / 1", whiteSpace: "nowrap" }}>
              {cooldownRemaining > 0
                ? t(resentCode ? "resendAgainIn" : "resendIn", {
                    time: formatCooldown(cooldownRemaining),
                  })
                : t("resend")}
            </span>
          </span>
        </Button>
      </div>
    </div>
  );
}
