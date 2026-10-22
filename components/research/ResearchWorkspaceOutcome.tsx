"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import type { ResearchScope } from "@/lib/research/scope";
import { useTranslations } from "next-intl";
import { type ResearchState, ResearchStatePanel } from "./ResearchStatePanel";
import {
  focusResearchSeedInput,
  type ResearchTab,
  researchFailureState,
} from "./research-workspace-model";
import type { useResearchWorkspaceCopy } from "./useResearchWorkspaceCopy";

export function ResearchWorkspaceOutcome({
  activeTab,
  researching,
  projectId,
  scope,
  researchAvailable,
  budgetState,
  copy,
  onRetry,
}: {
  activeTab: ResearchTab | null;
  researching: boolean;
  projectId: string;
  scope: ResearchScope;
  researchAvailable: boolean;
  budgetState: ResearchState | null;
  copy: ReturnType<typeof useResearchWorkspaceCopy>;
  onRetry: () => void;
}) {
  const paymentT = useTranslations("shared.actionPayment");
  if (researching) return <ResearchStatePanel projectRef={projectId} state="loading" />;
  if (!activeTab)
    return (
      <ResearchStatePanel
        projectRef={projectId}
        resumeLabel={copy.budgetResetLabel()}
        scopeLabel={`${scope.countryName} / ${scope.languageLabel}`}
        state={budgetState ?? (researchAvailable ? "idle" : "unsupported_location")}
      />
    );
  if (activeTab.outcome.ok)
    return activeTab.outcome.rows.length === 0 ? (
      <div className="grid gap-3">
        <PaymentChargeLine payment={activeTab.outcome.payment} />
        <ResearchStatePanel
          cached={activeTab.outcome.cached}
          scopeLabel={`${activeTab.scope.countryName} / ${activeTab.scope.languageLabel}`}
          mode={activeTab.mode}
          onEditSearch={focusResearchSeedInput}
          projectRef={projectId}
          state="empty"
        />
      </div>
    ) : null;
  const payment = "payment" in activeTab.outcome ? activeTab.outcome.payment : undefined;
  const legacyCharged = "charged" in activeTab.outcome ? activeTab.outcome.charged : false;
  const unresolved =
    activeTab.outcome.reason === "payment_already_executed" ||
    (payment ? payment.state === "pending" || payment.state === "unknown" : legacyCharged === null);
  const charged = payment || unresolved ? null : legacyCharged;
  return (
    <div className="grid gap-3">
      {payment ? (
        <div role="status">
          <PaymentChargeLine payment={payment} />
        </div>
      ) : null}
      {!payment && unresolved ? (
        <p role="status" className="m-0 text-[12px] text-fg-muted">
          {paymentT("unknown")}
        </p>
      ) : null}
      <ResearchStatePanel
        charged={charged}
        onRetry={unresolved ? undefined : onRetry}
        projectRef={projectId}
        retryLabel={copy.retryLabel(
          activeTab.retryEstimate ?? { cached: false, costCents: null, loading: false },
        )}
        resumeLabel={copy.budgetResetLabel()}
        scopeLabel={`${activeTab.scope.countryName} / ${activeTab.scope.languageLabel}`}
        state={researchFailureState(activeTab.outcome)}
      />
    </div>
  );
}
