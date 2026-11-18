"use client";

import type { FundingOptionView } from "@/lib/assistant/wire";
import { useLocale, useTranslations } from "next-intl";
import { creditUsageLabel } from "./funding-format";

export function FundingDetails({ option }: Readonly<{ option: FundingOptionView | undefined }>) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  if (!option) return null;
  const usage = option.mode === "credits" && option.available ? option.usage : null;
  const spent = usage ? creditUsageLabel(usage, locale) : null;
  const unavailable = !option.available && option.reason;
  const byokKey = option.mode === "byok" && option.credential;
  if (!unavailable && !usage && !byokKey) return null;
  return (
    <div className="border-b border-border px-3 py-2 text-xs text-fg-muted">
      {!option.available && option.reason ? <p>{t(`errors.${option.reason}`)}</p> : null}
      {spent ? (
        <p>
          {spent.limit
            ? t("creditsUsed", { used: spent.used, limit: spent.limit })
            : t("creditsUsedOpen", { used: spent.used })}
        </p>
      ) : null}
      {option.mode === "byok" && option.credential ? (
        <p>
          {t("keyLast4", {
            last4: option.credential.last4,
            status: t(
              option.credential.status === "active" ? "credentialActive" : "credentialInvalid",
            ),
          })}
        </p>
      ) : null}
    </div>
  );
}
