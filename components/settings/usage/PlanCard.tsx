"use client";

import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { UsageCard } from "@/components/settings/usage/UsageCard";
import { Button, FieldLabel, Input, StatusPill } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type HostedPricingFeedbackInput,
  hostedPricingFeedbackSchema,
} from "@/lib/schemas/usage-settings";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type SubmitPricingFeedback = (
  input: HostedPricingFeedbackInput,
) => Promise<{ answered: true }>;

type PlanCardProps = {
  canSubmitPricingFeedback: boolean;
  deployment: "cloud" | "self-host";
  initialAnswered?: boolean;
  projectId: string;
  submitPricingFeedback: SubmitPricingFeedback;
};

function SelfHostedPlan() {
  return (
    <div className="space-y-3" data-pricing-state="self-hosted">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-semibold tracking-[-0.2px]">Self-hosted</span>
        <StatusPill label="No app subscription" showDot={false} status="connected" />
      </div>
      <p className="m-0 max-w-[640px] text-[13px] leading-[1.55] text-fg-muted">
        This instance runs on infrastructure you operate. Bisibility does not charge a subscription
        or per-keyword license fee for the self-hosted app.
      </p>
      <p className="m-0 text-[12px] leading-[1.55] text-fg-muted">
        Infrastructure, provider requests and optional services remain your costs.
      </p>
    </div>
  );
}

function HostedPlanSummary() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-semibold tracking-[-0.2px]">Hosted plan</span>
        <StatusPill label="Free beta" showDot={false} status="ready" />
      </div>
      <ul className="m-0 grid list-none gap-2 border-t border-border-soft pt-3 text-[12.5px] leading-[1.5] text-fg-muted">
        <li>Free while the beta lasts, with usage limits and no payment method.</li>
        <li>Pricing will be announced before the beta ends.</li>
        <li>Nothing is charged without your confirmation.</li>
        <li>Provider accounts, quotas and billing stay directly with each provider.</li>
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
  const [answered, setAnswered] = useState(initialAnswered);
  const [actionError, setActionError] = useState<string | null>(null);
  const form = useForm<HostedPricingFeedbackInput>({
    defaultValues: { monthlyPrice: "20", projectId },
    resolver: zodResolver(hostedPricingFeedbackSchema),
  });

  async function submit(values: HostedPricingFeedbackInput) {
    setActionError(null);
    try {
      await submitPricingFeedback(values);
      setAnswered(true);
    } catch (error) {
      setActionError(actionErrorMessage(error, "Pricing feedback could not be sent."));
    }
  }

  return (
    <UsageCard
      className={deployment === "cloud" ? "min-h-[340px]" : "min-h-[232px]"}
      description={
        deployment === "cloud"
          ? "Your hosted beta status and optional pricing feedback."
          : "The application plan for this deployment."
      }
      title="Plan"
    >
      {deployment === "self-host" ? (
        <SelfHostedPlan />
      ) : (
        <div className="space-y-5" data-pricing-state={answered ? "answered" : "hosted-beta"}>
          <HostedPlanSummary />
          {answered ? (
            <p className="m-0 border-t border-border-soft pt-4 text-[13px] font-medium text-green-text">
              Thanks, your answer helps us set the price.
            </p>
          ) : canSubmitPricingFeedback ? (
            <form className="border-t border-border-soft pt-4" onSubmit={form.handleSubmit(submit)}>
              <FieldLabel
                className="font-mono text-[10px] tracking-[0.5px] text-fg-muted uppercase"
                htmlFor="hosted-monthly-price"
                label="What would you pay per month?"
              />
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start">
                <SettingsField className="flex items-center gap-2" width="field">
                  <span aria-hidden className="font-mono text-[13px] text-fg-muted">
                    $
                  </span>
                  <Input
                    {...form.register("monthlyPrice")}
                    aria-label="What would you pay per month?"
                    id="hosted-monthly-price"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </SettingsField>
                <Button
                  loading={form.formState.isSubmitting}
                  loadingLabel="Sending"
                  startIcon={<PaperPlaneTilt aria-hidden size={15} weight="bold" />}
                  type="submit"
                  variant="secondary"
                >
                  Send feedback
                </Button>
              </div>
              <p className="m-0 mt-1.5 text-[11.5px] text-fg-muted">
                Four digits at most. The answer is not a commitment.
              </p>
              {form.formState.errors.monthlyPrice ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-red-text">
                  {form.formState.errors.monthlyPrice.message}
                </p>
              ) : null}
              {actionError ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-red-text">{actionError}</p>
              ) : null}
            </form>
          ) : (
            <p className="m-0 border-t border-border-soft pt-4 text-[12px] text-fg-muted">
              Only the project owner can send pricing feedback.
            </p>
          )}
        </div>
      )}
    </UsageCard>
  );
}
