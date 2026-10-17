"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import type { AiCatalogFailureReason, AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { LEGACY_PRICING_CHECKED_AT } from "@/lib/ai-research/legacy";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { appPath } from "@/lib/routing/app-path";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AiCatalogNotice } from "./AiCatalogNotice";
import { AiCostPolicyFields } from "./AiCostPolicyFields";
import { AiPromptFields } from "./AiPromptFields";
import { AiResearchResults } from "./AiResearchResults";
import { AiVisibilityFields } from "./AiVisibilityFields";
import { failureCopyKey } from "./ai-research-failure-copy";
import {
  aiResearchDefaults,
  extendedPromptAvailable,
  freshResearchCatalog,
  legacyResearchInput,
} from "./ai-research-presets";
import { useAiResearchSubmission } from "./useAiResearchSubmission";

type History = { id: string; title: string; createdAt: string }[];
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
}: Readonly<{
  projectId: string;
  domain: string;
  mode: "visibility" | "prompt";
  history: History;
  initialOutcome?: AiResearchOutcome;
  canRun?: boolean;
  analyzeAction?: typeof analyzeAiResearchAction;
  catalog?: AiResearchCatalog;
  catalogError?: string;
  catalogFailure?: AiCatalogFailureReason;
  supportingProviders?: readonly string[];
}>) {
  const errors = useSharedErrorMessages();
  const t = useTranslations("projectAiResearch");
  const schema = mode === "visibility" ? visibilitySchema : promptSchema;
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: aiResearchDefaults(mode, domain),
  });
  const values = form.watch();
  const freshCatalog = freshResearchCatalog(catalog, catalogError);
  const legacy = legacyResearchInput(mode, values);
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const unavailable = !freshCatalog;
  const noSource = catalogFailure === "no_source";
  const pricingUnavailable =
    mode === "prompt" &&
    !actual &&
    Boolean(freshCatalog) &&
    !freshCatalog?.models.some((model) => model.priceAvailable);
  const extendedUnavailable =
    !legacy && (mode === "prompt" ? !extendedPromptAvailable(freshCatalog, values) : unavailable);
  const {
    outcome,
    error,
    pending,
    estimateCurrent,
    estimateAffordable,
    credentialsRejected,
    retryBlocked,
    completed,
    submit,
    newRequest,
  } = useAiResearchSubmission({
    form,
    mode,
    catalog: freshCatalog,
    projectId,
    canRun: canRun && !noSource,
    unavailable: extendedUnavailable,
    analyzeAction,
    initialOutcome,
  });
  const disabled = !canRun || noSource || pending || retryBlocked || completed;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="m-0 max-w-3xl text-ui-body leading-relaxed text-fg-muted">
        {mode === "visibility" ? t("visibilityDescription") : t("promptDescription")}
      </p>
      {!canRun ? <Card className="text-ui-body text-fg-muted">{t("readOnly")}</Card> : null}
      {unavailable && !noSource ? (
        <AiCatalogNotice mode={mode} projectId={projectId} reason={catalogFailure} />
      ) : null}
      {pricingUnavailable ? (
        <Card role="alert" className="text-ui-body text-fg-muted">
          {t("pricingUnavailableLegacy")}
        </Card>
      ) : null}
      <ProviderAccessGate
        blocked={noSource}
        providers={supportingProviders}
        href={appPath(projectId, "integrations")}
      >
        <Card>
          <form
            className="grid gap-4"
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
                <AiVisibilityFields form={form} catalog={freshCatalog} disabled={disabled} />
              ) : (
                <AiPromptFields form={form} catalog={freshCatalog} disabled={disabled} />
              )}
              {mode === "prompt" ? (
                <AiCostPolicyFields form={form} catalog={freshCatalog} disabled={disabled} />
              ) : (
                <label htmlFor="ai-cost-limit" className="grid gap-2 text-ui-body">
                  {t("costCap")}
                  <Input
                    id="ai-cost-limit"
                    type="number"
                    min={0}
                    max={1000}
                    {...form.register("max_cost_cents", { valueAsNumber: true })}
                  />
                </label>
              )}
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
                onClick={() => submit(false)}
                loading={pending}
                disabled={disabled || extendedUnavailable || !estimateAffordable}
              >
                {t("runAnalysis")}
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
      {error || (outcome && !outcome.ok) ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {error
            ? t("requestFailure")
            : outcome && !outcome.ok
              ? presentBudgetDenial(outcome.reason, errors, t(failureCopyKey(outcome.reason)))
              : ""}
        </Card>
      ) : null}
      {estimateCurrent && outcome?.ok && outcome.estimate ? (
        <Card className="text-ui-body">
          {t(
            actual
              ? "actualCostForecast"
              : mode === "prompt"
                ? legacy
                  ? "legacyAdmissionEstimate"
                  : "conservativeBound"
                : "visibilityEstimate",
            {
              cost: outcome.estimatedCostCents.toFixed(2),
              date: LEGACY_PRICING_CHECKED_AT,
            },
          )}
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
          <AiResearchResults result={outcome.result} />
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
      <Card>
        <h2 className="text-ui-body font-semibold">{t("recentReports")}</h2>
        {history.length ? (
          <div className="mt-3 grid gap-3">
            {history.map((report) => (
              <Link
                key={report.id}
                href={`/app/${projectId}/agent-reports/${report.id}`}
                className="flex flex-wrap justify-between gap-2 text-ui-body text-accent-text"
              >
                <span>{report.title}</span>
                <span className="font-mono text-ui-xs text-fg-muted">
                  {report.createdAt.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-ui-body text-fg-muted">{t("historyEmpty")}</p>
        )}
      </Card>
    </div>
  );
}
