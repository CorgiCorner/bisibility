"use client";
import { ActionPaymentReview } from "@/components/action-payment/ActionPaymentReview";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Disclosure } from "@/components/ui/Disclosure";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { failureCopyKey } from "./ai-research-failure-copy";
import type { useAiResearchSubmission } from "./useAiResearchSubmission";

export function AiPromptPaymentReview({
  actual,
  submission,
  onClose,
  onConfirm,
}: Readonly<{
  actual: boolean;
  submission: ReturnType<typeof useAiResearchSubmission>;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  const t = useTranslations("projectAiResearch");
  const paymentT = useTranslations("shared.actionPayment");
  const errors = useSharedErrorMessages();
  const {
    quote,
    outcome,
    pending,
    error,
    estimateAffordable,
    estimateCurrent,
    credentialsRejected,
    submit,
  } = submission;
  const failure = error
    ? t("requestFailure")
    : outcome && !outcome.ok
      ? presentBudgetDenial(outcome.reason, errors, t(failureCopyKey(outcome.reason)))
      : undefined;
  return (
    <ActionPaymentReview
      items={
        quote
          ? [
              {
                key: "prompt",
                label: t("prompt"),
                quote,
                options: outcome?.ok && outcome.estimate ? (outcome.paymentOptions ?? []) : [],
              },
            ]
          : []
      }
      loading={pending}
      failed={Boolean(failure)}
      failureMessage={failure}
      confirmLabel={t("runAnalysis")}
      confirmDisabled={!estimateAffordable}
      onClose={onClose}
      onConfirm={onConfirm}
      onRefresh={() => submit(true)}
      onOptionChange={(_key, id) => submit(true, id)}
    >
      {!pending && !failure && !estimateCurrent ? (
        <p className="m-0 text-ui-caption text-fg-muted">{t("estimateRequired")}</p>
      ) : null}
      {!pending && estimateCurrent && !estimateAffordable ? (
        <p role="alert" className="m-0 text-ui-body text-red-text">
          {t(credentialsRejected ? "actualCostUnavailable" : "estimateAboveCap")}
        </p>
      ) : null}
      {actual ? (
        <>
          <p className="m-0 text-ui-caption text-fg-muted">
            {paymentT("forecast")}: {t("actualCostRisk")}
          </p>
          <Disclosure title={t("estimateCalculation")} variant="inline">
            <p className="text-ui-caption text-fg-muted">{t("forecastDetails")}</p>
          </Disclosure>
        </>
      ) : null}
    </ActionPaymentReview>
  );
}
