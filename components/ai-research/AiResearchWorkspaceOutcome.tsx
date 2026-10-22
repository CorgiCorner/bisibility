"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { PaymentQuoteSummary } from "@/components/action-payment/PaymentQuoteSummary";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { appPath } from "@/lib/routing/app-path";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AiSourceRetry } from "./AiCatalogNotice";
import { AiResearchHistory, type AiResearchHistoryEntry } from "./AiResearchHistory";
import { AiResearchResults } from "./AiResearchResults";
import { failureCopyKey } from "./ai-research-failure-copy";
import type { useAiResearchSubmission } from "./useAiResearchSubmission";

type Submission = ReturnType<typeof useAiResearchSubmission>;

export function AiResearchWorkspaceOutcome({
  actual,
  catalogSourceMissing,
  freshCatalog,
  history,
  mode,
  noSource,
  projectId,
  submission,
  supportingProviders,
}: Readonly<{
  actual: boolean;
  catalogSourceMissing: boolean;
  freshCatalog?: AiResearchCatalog;
  history: AiResearchHistoryEntry[];
  mode: "visibility" | "prompt";
  noSource: boolean;
  projectId: string;
  submission: Submission;
  supportingProviders: readonly string[];
}>) {
  const paymentT = useTranslations("shared.actionPayment");
  const errors = useSharedErrorMessages();
  const t = useTranslations("projectAiResearch");
  const {
    error,
    estimateCurrent,
    expired,
    newRequest,
    outcome,
    pending,
    quote,
    sourceRetryAvailable,
    submit,
  } = submission;
  return (
    <>
      {error || (outcome && !outcome.ok && outcome.reason !== "no_source") ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {error
            ? t("requestFailure")
            : outcome && !outcome.ok
              ? presentBudgetDenial(outcome.reason, errors, t(failureCopyKey(outcome.reason)))
              : ""}
        </Card>
      ) : null}
      {outcome && !outcome.ok && outcome.payment ? (
        <PaymentChargeLine payment={outcome.payment} />
      ) : null}
      {estimateCurrent && outcome?.ok && outcome.estimate ? (
        <Card className="text-ui-body">
          <PaymentQuoteSummary
            quote={quote}
            options={outcome.paymentOptions}
            disabled={pending}
            label={actual ? paymentT("forecast") : undefined}
            onOptionChange={(option) => submit(true, option.id)}
          />
          {expired ? (
            <p role="alert" className="text-xs text-warning">
              {paymentT("expired")}
            </p>
          ) : null}
          {actual ? <p className="mt-2 text-ui-xs text-fg-muted">{t("actualCostRisk")}</p> : null}
          {actual && outcome.forecastAssumptions?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ui-xs text-fg-muted">
              {outcome.forecastAssumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      {outcome?.ok && !outcome.estimate ? (
        <>
          <AiResearchResults
            result={outcome.result}
            payment={outcome.payment}
            originalPayment={outcome.originalPayment}
          />
          <Link
            className="text-ui-body text-accent-text underline"
            href={`/app/${projectId}/agent-reports/${outcome.reportId}`}
          >
            {t("openReport")}
          </Link>
        </>
      ) : noSource ? (
        <ProviderAccessEmptyState
          surface="ai"
          href={appPath(projectId, "integrations")}
          providers={supportingProviders}
        />
      ) : !outcome ? (
        <EmptyState
          title={mode === "visibility" ? t("visibilityEmpty") : t("promptEmpty")}
          description={t("emptyDescription")}
        />
      ) : null}
      {sourceRetryAvailable && !catalogSourceMissing && freshCatalog ? (
        <AiSourceRetry onRetry={newRequest} />
      ) : null}
      <AiResearchHistory history={history} projectId={projectId} />
    </>
  );
}
