"use client";

import { ActionPaymentLoading } from "@/components/action-payment/ActionPaymentLoading";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import type { PromptResearchPageData } from "@/lib/actions/prompt-research";
import { researchQuoteIsPriced } from "@/lib/ai-research/research-cost";
import { researchQuestions } from "@/lib/ai-research/research-questions";
import {
  emptyResearchTabContext,
  type ResearchTabContext,
} from "@/lib/ai-research/research-tab-model";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { appPath } from "@/lib/routing/app-path";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ResearchLookupControls } from "./ResearchLookupControls";
import { ResearchPaymentDialog } from "./ResearchPaymentDialog";
import { ResearchQuestionTable } from "./ResearchQuestionTable";
import { ResearchRecentLookups } from "./ResearchRecentLookups";
import { useResearchLookup } from "./use-research-lookup";

export function PromptResearchClient({
  context = emptyResearchTabContext("prj_example"),
  data,
  keyword = "",
  projectId,
}: Readonly<{
  context?: ResearchTabContext;
  data: PromptResearchPageData;
  keyword?: string;
  projectId: string;
}>) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ResearchClient
        key={`${projectId}:${keyword}`}
        context={context}
        data={data}
        keyword={keyword}
        projectId={projectId}
      />
    </QueryClientProvider>
  );
}

function ResearchClient({
  context,
  data,
  keyword,
  projectId,
}: Readonly<{
  context: ResearchTabContext;
  data: PromptResearchPageData;
  keyword: string;
  projectId: string;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const errors = useSharedErrorMessages();
  const locale = useLocale();
  const router = useRouter();
  const [sourceMissing, setSourceMissing] = useState(false);
  const lookup = useResearchLookup({
    data: { ...data, hasSource: data.hasSource && !sourceMissing },
    keyword,
    onSourceMissing: () => setSourceMissing(true),
    projectId,
  });
  const noSource =
    !data.hasSource ||
    sourceMissing ||
    Boolean(data.initial && !data.initial.ok && data.initial.reason === "no_source");
  const showNotice = Boolean(data.initial?.ok && !data.initial.estimate);
  const result = lookup.display?.ok && !lookup.display.estimate ? lookup.display : undefined;
  const priced = researchQuoteIsPriced(lookup.quote?.charge);
  const actionLabel =
    priced && lookup.quote
      ? t("findPromptsCost", { cost: formatPaymentAmount(lookup.quote.charge, locale) })
      : t("findPrompts");
  const failure = lookup.failure;
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-3xl text-ui-body text-fg-muted">{t("lead")}</p>
        <ResearchRecentLookups projectId={projectId} recent={context.recent} />
      </div>
      <p className="m-0 text-ui-caption text-fg-muted">{t("brandLookupHint")}</p>
      <ProviderAccessGate
        blocked={noSource}
        href={appPath(projectId, "providers")}
        providers={data.supportingProviders}
        showNotice={showNotice}
        surface="ai"
      >
        <ResearchLookupControls
          actionLabel={actionLabel}
          context={context}
          disabled={!data.canWrite || lookup.pending}
          keyword={keyword}
          onSearch={(next) =>
            router.push(aiVisibilityTabHref(projectId, "research", { keyword: next }))
          }
          onSubmitCurrent={() => {
            if (result) return;
            lookup.setReviewOpen(true);
          }}
          projectId={projectId}
        />
      </ProviderAccessGate>
      {result?.cached ? <p className="m-0 text-ui-caption text-fg-muted">{t("cached")}</p> : null}
      {noSource && !showNotice ? (
        <ProviderAccessEmptyState
          href={appPath(projectId, "providers")}
          providers={data.supportingProviders}
          surface="ai"
        />
      ) : null}
      {!data.canWrite ? <EmptyState description={t("readOnlyHint")} title={t("readOnly")} /> : null}
      {lookup.pending ? <ActionPaymentLoading label={t("loadingResults")} /> : null}
      {lookup.failed ? (
        <Card className="text-ui-body text-red-text" role="alert">
          {presentBudgetDenial(
            failure,
            errors,
            t(failure === "insufficient_credits" ? "insufficientCredits" : "requestFailure"),
          )}
        </Card>
      ) : null}
      {lookup.display?.payment && (!lookup.display.ok || !lookup.display.estimate) ? (
        <PaymentChargeLine payment={lookup.display.payment} />
      ) : null}
      {lookup.blocked ? (
        <p className="text-ui-body text-red-text" role="alert">
          {t("reviewAttempt")}
        </p>
      ) : null}
      <ResearchPaymentDialog keyword={keyword} lookup={lookup} />
      {result && "prompts" in result ? (
        result.result.failure && result.prompts.length === 0 ? (
          <p className="text-ui-body text-red-text" role="alert">
            {t("partialFailure")}
          </p>
        ) : (
          <>
            {result.result.failure ? (
              <p className="text-ui-body text-red-text" role="alert">
                {t("partialFailure")}
              </p>
            ) : null}
            <ProviderAccessGate blocked={noSource} showNotice={false} surface="ai">
              <ResearchQuestionTable
                canWrite={data.canWrite}
                dailyUsdPerPrompt={context.dailyUsdPerPrompt}
                engines={context.engines}
                entities={context.entities}
                keyword={keyword}
                projectId={projectId}
                questions={researchQuestions(result.result.rows, result.prompts, context.entities)}
                reportId={result.reportId}
                topics={data.topics}
              />
            </ProviderAccessGate>
          </>
        )
      ) : null}
      <p className="m-0 text-ui-caption leading-relaxed text-fg-muted">{t("datasetNotice")}</p>
    </div>
  );
}
