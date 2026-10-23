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
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AiCatalogNotice } from "./AiCatalogNotice";
import { type AiEngineOption, researchDefaults } from "./AiEngineFields";
import { AiPromptFields } from "./AiPromptFields";
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
  const paymentT = useTranslations("shared.actionPayment");
  const locale = useLocale();
  const t = useTranslations("projectAiResearch");
  const schema = mode === "visibility" ? visibilitySchema : promptSchema;
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: researchDefaults(mode, domain, engineOptions),
  });
  const values = form.watch();
  const { displayCatalog, freshCatalog, noticeReason, onCatalogInteract, status } =
    useAiResearchCatalogRefresh({ catalog, catalogError, catalogFailure, projectId });
  const legacy = legacyResearchInput(mode, values);
  const engineMode = "engines" in values && (values.engines?.length ?? 0) > 0;
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const catalogSourceMissing = catalogFailure === "no_source";
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
        <p className="m-0 text-ui-xs text-fg-muted" role="status">
          {t("catalogRefreshing")}
        </p>
      ) : status === "unavailable" ? (
        <AiCatalogNotice mode={mode} projectId={projectId} reason={noticeReason} />
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
        href={appPath(projectId, "integrations")}
      >
        <Card>
          <form
            className="grid gap-4"
            onChange={onCatalogInteract}
            onFocus={onCatalogInteract}
            onSubmit={(event) => {
              event.preventDefault();
              submit(true);
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
                type="submit"
                variant="secondary"
                loading={pending}
                disabled={disabled || extendedUnavailable}
              >
                {t("estimateCost")}
              </Button>
              <Button
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
              <span className="text-ui-xs text-fg-muted">
                {t(actual ? "actualReplayHint" : "cacheHint")}
              </span>
            </div>
            {retryBlocked ? (
              <p role="alert" className="m-0 text-ui-body text-red-text">
                {t("actualCostUsageReview")}
              </p>
            ) : null}
            {completed ? (
              <Button type="button" variant="secondary" onClick={newRequest}>
                {t("newRequest")}
              </Button>
            ) : null}
            {!noSource &&
              canRun &&
              !retryBlocked &&
              !completed &&
              (!estimateCurrent ? (
                <p className="m-0 text-ui-xs text-fg-muted">{t("estimateRequired")}</p>
              ) : !estimateAffordable ? (
                <p role="alert" className="m-0 text-ui-body text-red-text">
                  {t(credentialsRejected ? "actualCostUnavailable" : "estimateAboveCap")}
                </p>
              ) : null)}
          </form>
        </Card>
      </ProviderAccessGate>
      <AiResearchWorkspaceOutcome
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
