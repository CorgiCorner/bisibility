"use client";
import { quoteAddCreditsHref } from "@/components/action-payment/PaymentQuoteSummary";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import type { AiCatalogFailureReason, AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { appPath } from "@/lib/routing/app-path";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AiCatalogNotice } from "./AiCatalogNotice";
import { type AiEngineOption, researchDefaults } from "./AiEngineFields";
import { AiPromptFields } from "./AiPromptFields";
import { AiPromptPaymentReview } from "./AiPromptPaymentReview";
import { AiResearchCostCap } from "./AiResearchCostCap";
import type { AiResearchHistoryEntry } from "./AiResearchHistory";
import { AiResearchWorkspaceOutcome } from "./AiResearchWorkspaceOutcome";
import { AiVisibilityFields } from "./AiVisibilityFields";
import { extendedPromptAvailable, legacyResearchInput } from "./ai-research-presets";
import { useAiResearchCatalogRefresh } from "./useAiResearchCatalogRefresh";
import { useAiResearchSubmission } from "./useAiResearchSubmission";
export function AiResearchWorkspace({
  projectId,
  domain,
  mode,
  history,
  initialOutcome,
  canRun = true,
  analyzeAction = analyzeAiResearchAction,
  catalog,
  catalogError,
  catalogFailure,
  supportingProviders = [],
  engineOptions = [],
}: Readonly<{
  projectId: string;
  domain: string;
  mode: "visibility" | "prompt";
  history: AiResearchHistoryEntry[];
  initialOutcome?: AiResearchOutcome;
  canRun?: boolean;
  analyzeAction?: typeof analyzeAiResearchAction;
  catalog?: AiResearchCatalog;
  catalogError?: string;
  catalogFailure?: AiCatalogFailureReason;
  supportingProviders?: readonly string[];
  engineOptions?: readonly AiEngineOption[];
}>) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const paymentT = useTranslations("shared.actionPayment");
  const locale = useLocale();
  const t = useTranslations("projectAiResearch");
  const schema = mode === "visibility" ? visibilitySchema : promptSchema;
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: researchDefaults(mode, domain, engineOptions, catalog),
  });
  const values = form.watch();
  const { displayCatalog, freshCatalog, noticeReason, onCatalogInteract, onCatalogRetry, status } =
    useAiResearchCatalogRefresh({ catalog, catalogError, catalogFailure, projectId });
  const legacy = legacyResearchInput(mode, values);
  const engineMode = "engines" in values && (values.engines?.length ?? 0) > 0;
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const catalogSourceMissing = noticeReason === "no_source";
  const pricingUnavailable =
    mode === "prompt" &&
    !actual &&
    Boolean(freshCatalog) &&
    !freshCatalog?.models.some((model) => model.priceAvailable);
  const extendedUnavailable =
    !engineMode &&
    !legacy &&
    (mode === "prompt" ? !extendedPromptAvailable(freshCatalog, values) : !freshCatalog);
  const submission = useAiResearchSubmission({
    form,
    mode,
    catalog: freshCatalog,
    projectId,
    canRun: canRun && !catalogSourceMissing,
    unavailable: extendedUnavailable,
    analyzeAction,
    initialOutcome,
  });
  const {
    completed,
    credentialsRejected,
    estimateAffordable,
    estimateCurrent,
    expired,
    newRequest,
    outcome,
    pending,
    quote,
    retryBlocked,
    submit,
  } = submission;
  const noSource =
    catalogSourceMissing || Boolean(outcome && !outcome.ok && outcome.reason === "no_source");
  const disabled = !canRun || noSource || pending || retryBlocked || completed;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="m-0 max-w-3xl text-ui-body leading-relaxed text-fg-muted">
        {mode === "visibility" ? t("visibilityDescription") : t("promptDescription")}
      </p>
      {!canRun ? <Card className="text-ui-body text-fg-muted">{t("readOnly")}</Card> : null}
      {status === "refreshing" ? (
        <p className="m-0 text-ui-caption text-fg-muted" role="status">
          {t("catalogRefreshing")}
        </p>
      ) : status === "unavailable" ? (
        <AiCatalogNotice
          mode={mode}
          projectId={projectId}
          reason={noticeReason}
          onRetry={onCatalogRetry}
        />
      ) : null}
      {pricingUnavailable && !engineMode ? (
        <Card role="alert" className="text-ui-body text-fg-muted">
          {t("pricingUnavailableLegacy")}
        </Card>
      ) : null}
      <ProviderAccessGate
        showNotice={Boolean(outcome?.ok && !outcome.estimate)}
        surface="ai"
        blocked={noSource}
        providers={supportingProviders}
        href={appPath(projectId, "providers")}
      >
        {noSource && mode === "prompt" ? null : (
          <Card>
            <form
              className="grid gap-4"
              onChange={onCatalogInteract}
              onFocus={onCatalogInteract}
              onSubmit={(event) => {
                event.preventDefault();
                if (mode === "prompt") {
                  form.setValue("estimate_only", true);
                  void form.trigger().then((valid) => {
                    if (valid) {
                      setReviewOpen(true);
                      submit(true);
                    }
                  });
                } else submit(true);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={"ai-brand"} className="grid gap-2 text-ui-body">
                  {t("brand")}
                  <Input id={"ai-brand"} {...form.register("brand")} placeholder="Acme" />
                </label>
                <label htmlFor={"ai-domain"} className="grid gap-2 text-ui-body">
                  {t("domain")}
                  <Input id={"ai-domain"} {...form.register("domain")} placeholder="acme.com" />
                </label>
                {mode === "visibility" ? (
                  <AiVisibilityFields form={form} catalog={displayCatalog} disabled={disabled} />
                ) : (
                  <AiPromptFields
                    form={form}
                    catalog={displayCatalog}
                    disabled={disabled}
                    engineOptions={engineOptions}
                    onSelectionChange={() => {
                      if (estimateCurrent) submit(true);
                    }}
                  />
                )}
                {mode === "visibility" ? <AiResearchCostCap form={form} /> : null}
              </div>
              {Object.values(form.formState.errors).length ? (
                <p role="alert" className="text-ui-body text-red-text">
                  {t("validation")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="input"
                  type="submit"
                  variant="secondary"
                  loading={pending}
                  disabled={disabled || extendedUnavailable}
                >
                  {t("estimateCost")}
                </Button>
                {mode === "visibility" ? (
                  <Button
                    size="input"
                    type="button"
                    href={!expired ? quoteAddCreditsHref(quote) : undefined}
                    onClick={() => submit(expired)}
                    loading={pending}
                    disabled={
                      disabled ||
                      extendedUnavailable ||
                      (!expired && !quoteAddCreditsHref(quote) && !estimateAffordable)
                    }
                  >
                    {expired
                      ? paymentT("refreshPrice")
                      : quoteAddCreditsHref(quote)
                        ? paymentT("addCredits")
                        : t("runAnalysis")}
                    {quote && !expired ? ` · ${formatPaymentAmount(quote.charge, locale)}` : ""}
                  </Button>
                ) : null}
                <span className="text-ui-caption text-fg-muted">
                  {t(actual ? "actualReplayHint" : "cacheHint")}
                </span>
              </div>
              {retryBlocked ? (
                <p role="alert" className="m-0 text-ui-body text-red-text">
                  {t("actualCostUsageReview")}
                </p>
              ) : null}
              {completed ? (
                <Button
                  className="justify-self-start"
                  size="input"
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setReviewOpen(false);
                    newRequest();
                  }}
                >
                  {t("newRequest")}
                </Button>
              ) : null}
              {!noSource &&
                canRun &&
                !retryBlocked &&
                !completed &&
                !(mode === "prompt" && reviewOpen) &&
                (!estimateCurrent ? (
                  <p className="m-0 text-ui-caption text-fg-muted">{t("estimateRequired")}</p>
                ) : !estimateAffordable ? (
                  <p role="alert" className="m-0 text-ui-body text-red-text">
                    {t(credentialsRejected ? "actualCostUnavailable" : "estimateAboveCap")}
                  </p>
                ) : null)}
            </form>
          </Card>
        )}
      </ProviderAccessGate>
      {mode === "prompt" && reviewOpen && !noSource ? (
        <AiPromptPaymentReview
          actual={actual}
          submission={submission}
          onClose={() => setReviewOpen(false)}
          onConfirm={() => {
            if (!estimateAffordable || disabled || extendedUnavailable) return;
            setReviewOpen(false);
            submit(false);
          }}
        />
      ) : null}
      <AiResearchWorkspaceOutcome
        onNewRequest={() => {
          setReviewOpen(false);
          newRequest();
        }}
        hideEstimate={mode === "prompt"}
        hideError={mode === "prompt" && reviewOpen && !noSource}
        actual={actual}
        catalogSourceMissing={catalogSourceMissing}
        freshCatalog={freshCatalog}
        history={history}
        mode={mode}
        noSource={noSource}
        projectId={projectId}
        submission={submission}
        supportingProviders={supportingProviders}
      />
    </div>
  );
}
