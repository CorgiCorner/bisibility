import type { UpdateUsageBudget } from "@/components/settings/usage/BudgetEditModal";
import type { SubmitPricingFeedback } from "@/components/settings/usage/PlanCard";
import { PlanCard } from "@/components/settings/usage/PlanCard";
import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import type { ProviderUsageData } from "@/lib/settings/options";

export type UsageSettingsContentProps = {
  canEditBudget: boolean;
  canSubmitPricingFeedback: boolean;
  deployment: "cloud" | "self-host";
  initialPricingFeedbackAnswered?: boolean;
  projectId: string;
  submitPricingFeedback: SubmitPricingFeedback;
  updateBudget: UpdateUsageBudget;
  usage: ProviderUsageData;
};

export function UsageSettingsContent({
  canEditBudget,
  canSubmitPricingFeedback,
  deployment,
  initialPricingFeedbackAnswered,
  projectId,
  submitPricingFeedback,
  updateBudget,
  usage,
}: Readonly<UsageSettingsContentProps>) {
  return (
    <div className="flex w-full max-w-[760px] flex-col gap-[14px]" data-usage-settings="">
      <PlanCard
        canSubmitPricingFeedback={canSubmitPricingFeedback}
        deployment={deployment}
        initialAnswered={initialPricingFeedbackAnswered}
        projectId={projectId}
        submitPricingFeedback={submitPricingFeedback}
      />
      <ProviderUsageCard
        canEditBudget={canEditBudget}
        projectId={projectId}
        updateBudget={updateBudget}
        usage={usage}
      />
    </div>
  );
}
