"use client";

import { AiPromptPaymentReview } from "@/components/ai-research/AiPromptPaymentReview";
import { Card } from "@/components/ui/Card";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import type { AiCatalogFailureReason, AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { aiEngineLabel } from "@/lib/ai-research/engine-labels";
import type { AiEngine } from "@/lib/ai-research/engines";
import type {
  PlaygroundColumnRequest,
  PlaygroundEntity,
  PlaygroundSourceOverride,
  PlaygroundTopic,
} from "@/lib/ai-research/model-playground-view";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { appPath } from "@/lib/routing/app-path";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AiCatalogNotice } from "./AiCatalogNotice";
import { type AiEngineOption, researchDefaults } from "./AiEngineFields";
import { extendedPromptAvailable, legacyResearchInput } from "./ai-research-presets";
import { ModelPlaygroundComposer } from "./ModelPlaygroundComposer";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";
import { modelPlaygroundBlocks, modelPlaygroundLayoutClassName } from "./model-playground-layout";
import { useAiResearchCatalogRefresh } from "./useAiResearchCatalogRefresh";
import { useAiResearchSubmission } from "./useAiResearchSubmission";

function playgroundMode(): "prompt" | "visibility" {
  return "prompt";
}

function playgroundDefaults(
  domain: string,
  projectName: string,
  engineOptions: readonly AiEngineOption[],
  catalog: AiResearchCatalog | undefined,
  selectedEngines: readonly AiEngine[] | undefined,
) {
  const defaults = researchDefaults("prompt", domain, engineOptions, catalog);
  const brand = projectName.trim() || domain;
  if (!("prompt" in defaults)) return defaults;
  const engines = selectedEngines?.filter((engine) =>
    engineOptions.some((option) => option.engine === engine),
  );
  if (!engines?.length) return { ...defaults, brand };
  return { ...defaults, brand, engines };
}

function requestedColumns(
  values: object,
  engineOptions: readonly AiEngineOption[],
): PlaygroundColumnRequest[] {
  const fields = values as {
    engines?: readonly string[] | null;
    models?: readonly string[] | null;
  };
  if (fields.engines?.length) {
    return fields.engines.map((engine) => ({
      id: engine,
      label: aiEngineLabel(engine),
      model: engineOptions.find((option) => option.engine === engine)?.model ?? null,
    }));
  }
  return (fields.models ?? []).map((model) => ({ id: model, label: model, model }));
}

export function ModelPlayground({
  projectId,
  projectName,
  domain,
  initialOutcome,
  canRun = true,
  canTrack = false,
  analyzeAction = analyzeAiResearchAction,
  catalog,
  catalogError,
  catalogFailure,
  supportingProviders = [],
  engineOptions = [],
  entities,
  topics,
  sourceOverrides,
  selectedEngines,
}: Readonly<{
  projectId: string;
  projectName: string;
  domain: string;
  initialOutcome?: AiResearchOutcome;
  canRun?: boolean;
  canTrack?: boolean;
  analyzeAction?: typeof analyzeAiResearchAction;
  catalog?: AiResearchCatalog;
  catalogError?: string;
  catalogFailure?: AiCatalogFailureReason;
  supportingProviders?: readonly string[];
  engineOptions?: readonly AiEngineOption[];
  entities: readonly PlaygroundEntity[];
  topics: readonly PlaygroundTopic[];
  sourceOverrides: readonly PlaygroundSourceOverride[];
  selectedEngines?: readonly AiEngine[];
}>) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const phase = useRef<"estimate" | "run">("estimate");
  const snapshot = useRef<{
    columns: PlaygroundColumnRequest[];
    prompt: string;
    reportId: string;
  } | null>(null);
  const locale = useLocale();
  const t = useTranslations("projectAiResearch");
  const mode = playgroundMode();
  const schema = mode === "visibility" ? visibilitySchema : promptSchema;
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    defaultValues: playgroundDefaults(domain, projectName, engineOptions, catalog, selectedEngines),
    resolver: zodResolver(schema),
  });
  const values = form.watch();
  const { displayCatalog, freshCatalog, noticeReason, onCatalogInteract, onCatalogRetry, status } =
    useAiResearchCatalogRefresh({ catalog, catalogError, catalogFailure, projectId });
  const legacy = legacyResearchInput(mode, values);
  const engineMode = "engines" in values && (values.engines?.length ?? 0) > 0;
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const catalogSourceMissing = noticeReason === "no_source";
  const extendedUnavailable =
    !engineMode && !legacy && !extendedPromptAvailable(freshCatalog, values);
  const submission = useAiResearchSubmission({
    analyzeAction,
    canRun: canRun && !catalogSourceMissing,
    catalog: freshCatalog,
    form,
    initialOutcome,
    mode,
    projectId,
    unavailable: extendedUnavailable,
  });
  const { error, outcome, pending, quote, submit } = submission;
  const noSource =
    catalogSourceMissing || Boolean(outcome && !outcome.ok && outcome.reason === "no_source");
  const disabled =
    !canRun || noSource || pending || submission.retryBlocked || submission.completed;
  const finished = outcome?.ok && !outcome.estimate ? outcome : null;
  if (finished && snapshot.current?.reportId !== finished.reportId) {
    snapshot.current = {
      columns: requestedColumns(form.getValues(), engineOptions),
      prompt: "prompt" in values ? (values.prompt ?? "") : "",
      reportId: finished.reportId,
    };
  }
  const running = pending && phase.current === "run";
  const requests = (
    running ? requestedColumns(values, engineOptions) : (snapshot.current?.columns ?? [])
  ).filter((column) => !hidden.includes(column.id));
  const funding =
    finished?.payment?.option.fundingSource ??
    (outcome?.ok && outcome.estimate ? (outcome.payment?.option.fundingSource ?? null) : null);
  const project = entities.find((entity) => entity.kind === "project");
  return (
    <div
      className={modelPlaygroundLayoutClassName}
      data-model-playground-blocks={modelPlaygroundBlocks.join(" ")}
      data-model-playground-layout=""
    >
      {!canRun ? <Card className="text-ui-body text-fg-muted">{t("readOnly")}</Card> : null}
      {status === "refreshing" ? (
        <p className="m-0 text-ui-caption text-fg-muted" role="status">
          {t("catalogRefreshing")}
        </p>
      ) : status === "unavailable" && noticeReason !== "no_source" ? (
        <AiCatalogNotice
          mode="prompt"
          onRetry={onCatalogRetry}
          projectId={projectId}
          reason={noticeReason}
        />
      ) : null}
      <ProviderAccessGate
        blocked={noSource}
        href={appPath(projectId, "providers")}
        providers={supportingProviders}
        surface="ai"
      >
        <Card data-model-playground-block="composer">
          <ModelPlaygroundComposer
            catalog={displayCatalog}
            disabled={disabled}
            projectId={projectId}
            engineOptions={engineOptions}
            estimateText={quote ? formatPaymentAmount(quote.charge, locale) : null}
            form={form}
            funding={funding}
            onCatalogInteract={onCatalogInteract}
            onOptionChange={(id) => submit(true, id)}
            onRun={() => {
              setHidden([]);
              phase.current = "estimate";
              form.setValue("estimate_only", true);
              void form.trigger().then((valid) => {
                if (!valid) return;
                setReviewOpen(true);
                submit(true);
              });
            }}
            paymentOptionId={quote?.option.id}
            paymentOptions={outcome?.ok && outcome.estimate ? (outcome.paymentOptions ?? []) : []}
            pending={pending}
            runDisabled={disabled || extendedUnavailable}
          />
        </Card>
      </ProviderAccessGate>
      {reviewOpen ? (
        <AiPromptPaymentReview
          actual={actual}
          onClose={() => setReviewOpen(false)}
          onConfirm={() => {
            phase.current = "run";
            setReviewOpen(false);
            submit(false);
          }}
          submission={submission}
        />
      ) : null}
      {!reviewOpen && error ? (
        <p className="m-0 text-ui-body text-red-text" role="alert">
          {t("requestFailure")}
        </p>
      ) : null}
      <ModelPlaygroundResults
        canTrack={canTrack}
        columns={requests}
        entities={entities}
        funding={funding}
        onRemove={(id) => {
          setHidden((current) => (current.includes(id) ? current : [...current, id]));
          const engines = "engines" in values ? (values.engines ?? []) : [];
          if (engines.length > 1 && engines.includes(id as AiEngine)) {
            form.setValue(
              "engines",
              engines.filter((engine) => engine !== id),
              { shouldValidate: true },
            );
          }
        }}
        payment={finished?.payment}
        projectId={projectId}
        prompt={snapshot.current?.prompt ?? ""}
        reportId={finished?.reportId}
        result={running ? undefined : finished?.result}
        running={running}
        sourceContext={{
          competitorDomains: entities.flatMap((entity) =>
            entity.kind === "competitor" && entity.domain ? [entity.domain] : [],
          ),
          excludedNames: project?.excludedNames ?? [],
          overrides: sourceOverrides,
          ownDomain: project?.domain ?? null,
        }}
        topics={topics}
        unfinished={Boolean(
          finished?.result.failure ||
            finished?.result.truncated ||
            (finished && finished.result.rows.length < (snapshot.current?.columns.length ?? 0)),
        )}
      />
    </div>
  );
}
