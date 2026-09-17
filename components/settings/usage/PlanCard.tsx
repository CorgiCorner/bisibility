"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { UsageCard } from "@/components/settings/usage/UsageCard";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { StatusPill } from "@/components/ui/StatusPill";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { WaitlistFailureResult } from "@/lib/landing/waitlist-result";
import {
  type HostedPricingFeedbackInput,
  hostedPricingFeedbackSchema,
} from "@/lib/schemas/usage-settings";
import { classifyWaitlistError } from "@/lib/ui/action-error";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type SubmitPricingFeedback = (
  input: HostedPricingFeedbackInput,
) => Promise<{ answered: true } | WaitlistFailureResult>;

type PlanCardProps = {
  canSubmitPricingFeedback: boolean;
  deployment: "cloud" | "self-host";
  initialAnswered?: boolean;
  projectId: string;
  submitPricingFeedback: SubmitPricingFeedback;
};

function SelfHostedPlan() {
  const t = useTranslations("projectSettingsUsage.plan");
  return (
    <div className="space-y-3" data-pricing-state="self-hosted">
      <span className="block text-[17px] font-semibold tracking-[-0.2px]">
        {t("selfHostTitle")}
      </span>
      <p className="m-0 max-w-[640px] text-[13px] leading-[1.55] text-fg-muted">
        {t("selfHostBody")}
      </p>
      <p className="m-0 pt-2 text-[12px] leading-[1.55] text-fg-muted">{t("selfHostCosts")}</p>
    </div>
  );
}

function HostedPlanSummary() {
  const t = useTranslations("projectSettingsUsage.plan");
  const benefits = [t("benefitOne"), t("benefitTwo"), t("benefitThree"), t("benefitFour")];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-semibold tracking-[-0.2px]">{t("hostedTitle")}</span>
        <StatusPill label={t("freeBeta")} showDot={false} status="ready" />
      </div>
      <ul className="m-0 grid list-none gap-2 border-t border-border p-0 pt-3 text-[12.5px] leading-[1.5] text-fg-muted">
        {benefits.map((item) => (
          <li className="flex items-start gap-2.5" key={item}>
            <Check
              aria-hidden
              className="shrink-0 self-center [color:color-mix(in_srgb,var(--fg-muted)_60%,transparent)]"
              data-hosted-plan-bullet="true"
              size={14}
              weight="regular"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanCard({
  canSubmitPricingFeedback,
  deployment,
  initialAnswered = false,
  projectId,
  submitPricingFeedback,
}: Readonly<PlanCardProps>) {
  const t = useTranslations("projectSettingsUsage.plan");
  const sharedErrors = useSharedErrorMessages();
  const [answered, setAnswered] = useState(initialAnswered);
  const [actionError, setActionError] = useState<string | null>(null);
  const form = useForm<HostedPricingFeedbackInput>({
    defaultValues: { monthlyPrice: "20", projectId },
    resolver: zodResolver(hostedPricingFeedbackSchema),
  });

  async function submit(values: HostedPricingFeedbackInput) {
    setActionError(null);
    try {
      const result = await submitPricingFeedback(values);
      if ("ok" in result && !result.ok) {
        setActionError(
          result.code === "verification_failed"
            ? t("feedbackVerification")
            : t("feedbackRateLimited"),
        );
        return;
      }
      setAnswered(true);
    } catch (error) {
      const classified = classifyWaitlistError(error);
      setActionError(
        classified.kind === "verificationFailed"
          ? t("feedbackVerification")
          : classified.kind === "rateLimited"
            ? t("feedbackRateLimited")
            : classified.kind === "staleDeployment"
              ? sharedErrors.staleDeployment()
              : classified.kind === "serverComponentDigest"
                ? sharedErrors.serverComponentDigest({ digest: classified.digest })
                : t("sendError"),
      );
    }
  }

  return (
    <UsageCard
      className={deployment === "cloud" ? "min-h-[340px]" : "min-h-[232px]"}
      description={deployment === "cloud" ? t("cloudDescription") : t("selfHostDescription")}
      title={t("title")}
    >
      {deployment === "self-host" ? (
        <SelfHostedPlan />
      ) : (
        <div className="space-y-5" data-pricing-state={answered ? "answered" : "hosted-beta"}>
          <HostedPlanSummary />
          {answered ? (
            <p className="m-0 border-t border-border pt-4 text-[13px] font-medium text-green-text">
              {t("answered")}
            </p>
          ) : canSubmitPricingFeedback ? (
            <form className="border-t border-border pt-4" onSubmit={form.handleSubmit(submit)}>
              <FieldLabel
                className="font-sans tabular-nums text-[10px] tracking-[0.5px] text-fg-muted uppercase"
                htmlFor="hosted-monthly-price"
                label={t("priceLabel")}
              />
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start">
                <SettingsField className="flex items-center gap-2" width="field">
                  <span aria-hidden className="font-sans tabular-nums text-[13px] text-fg-muted">
                    $
                  </span>
                  <Input
                    {...form.register("monthlyPrice")}
                    aria-label={t("priceLabel")}
                    className="h-[35px] min-h-[35px]"
                    id="hosted-monthly-price"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </SettingsField>
                <Button
                  loading={form.formState.isSubmitting}
                  loadingLabel={t("sending")}
                  startIcon={<PaperPlaneTilt aria-hidden size={15} weight="regular" />}
                  type="submit"
                  variant="secondary"
                >
                  {t("send")}
                </Button>
              </div>
              {form.formState.errors.monthlyPrice ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-red-text">{t("priceInvalid")}</p>
              ) : null}
              {actionError ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-red-text">{actionError}</p>
              ) : null}
            </form>
          ) : (
            <p className="m-0 border-t border-border pt-4 text-[12px] text-fg-muted">
              {t("ownerOnly")}
            </p>
          )}
        </div>
      )}
    </UsageCard>
  );
}
