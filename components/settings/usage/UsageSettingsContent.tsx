import type { SubmitPricingFeedback } from "@/components/settings/usage/PlanCard";
import { PlanCard } from "@/components/settings/usage/PlanCard";
import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import type { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import type { ProviderUsageData } from "@/lib/settings/options";

export type UsageSettingsContentProps = {
  canEditBudget: boolean;
  canSubmitPricingFeedback: boolean;
  deployment: "cloud" | "self-host";
  initialBudgetEditOpen?: boolean;
  initialPricingFeedbackAnswered?: boolean;
  projectId: string;
  projectRef: string;
  submitPricingFeedback: SubmitPricingFeedback;
  updateProviderAllocation: typeof updateProviderConnectionAllocationAction;
  usage: ProviderUsageData & {
    providerSpend: import("@/lib/queries/provider-spend").ProjectProviderSpend;
  };
};

export function UsageSettingsContent({
  canEditBudget,
  canSubmitPricingFeedback,
  deployment,
  initialBudgetEditOpen,
  initialPricingFeedbackAnswered,
  projectId,
  projectRef,
  submitPricingFeedback,
  updateProviderAllocation,
  usage,
}: Readonly<UsageSettingsContentProps>) {
  return (
    <div className="flex w-full max-w-[760px] flex-col gap-3.5" data-usage-settings="">
      <PlanCard
        canSubmitPricingFeedback={canSubmitPricingFeedback}
        deployment={deployment}
        initialAnswered={initialPricingFeedbackAnswered}
        projectId={projectId}
        submitPricingFeedback={submitPricingFeedback}
      />
      <ProviderUsageCard
        canEditBudget={canEditBudget}
        initialBudgetEditOpen={initialBudgetEditOpen}
        projectId={projectId}
        projectRef={projectRef}
        updateProviderAllocation={updateProviderAllocation}
        usage={usage}
      />
    </div>
  );
}
