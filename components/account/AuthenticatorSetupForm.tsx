"use client";

import { completeTwoFactorEnrollmentSchema } from "@/lib/auth/two-factor-management-schema";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import {
  accentButtonClass,
  feedbackClass,
  fieldInputClass,
  fieldLabelClass,
  fieldValueClass,
  ghostButtonClass,
} from "./account-ui";

type AuthenticatorSetupFormProps = {
  onCancel: () => void;
  onSubmit: (values: { code: string }) => Promise<void>;
  pending: boolean;
  qrDataUrl: string | null;
  secret: string;
};

export function AuthenticatorSetupForm({
  onCancel,
  onSubmit,
  pending,
  qrDataUrl,
  secret,
}: Readonly<AuthenticatorSetupFormProps>) {
  const t = useTranslations("account.security.twoFactor");
  const form = useForm<{ code: string }>({
    defaultValues: { code: "" },
    mode: "onSubmit",
    resolver: zodResolver(completeTwoFactorEnrollmentSchema.pick({ code: true })),
  });

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        {qrDataUrl ? (
          // biome-ignore lint/performance/noImgElement: The generated QR code is an in-memory data URI.
          <img
            alt={t("qrAlt")}
            className="h-[180px] w-[180px] rounded-card border border-border bg-white p-2"
            src={qrDataUrl}
          />
        ) : (
          <span className={cn(fieldValueClass, "h-[180px] text-center text-fg-muted")}>
            {t("qrUnavailable")}
          </span>
        )}
        <div className="grid content-start gap-3">
          <div className={fieldLabelClass}>
            {t("secret")}
            <span className={cn(fieldValueClass, "break-all font-sans tabular-nums")}>
              {secret}
            </span>
          </div>
          <label className={fieldLabelClass}>
            {t("newCode")}
            <input
              autoComplete="one-time-code"
              className={fieldInputClass}
              inputMode="numeric"
              maxLength={6}
              {...form.register("code")}
            />
            {form.formState.errors.code ? (
              <span className={cn(feedbackClass, "text-red-text")}>{t("invalidInput")}</span>
            ) : null}
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={accentButtonClass} disabled={pending} type="submit">
          {pending ? t("verifying") : t("verify")}
        </button>
        <button className={ghostButtonClass} onClick={onCancel} type="button">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
