"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { TrackingPromptDraft } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { generationCanonicalJson } from "@/lib/ai-tracking/suggestions/generation-json";
import {
  modelSuggestionsPreviewInputSchema,
  REVIEWED_CONTEXT_CHARACTER_LIMIT,
  type SuggestionGenerationPreview,
  type SuggestionGenerationPreviewInput,
  type SuggestionGenerationResult,
} from "@/lib/ai-tracking/suggestions/generation-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { TrackingGenerationFields } from "./TrackingGenerationFields";

export function TrackingGenerationDrawer({
  review,
  actions,
  onCatalog,
  onClose,
  onReviewDraft,
  canWrite,
}: Readonly<{
  review: Awaited<ReturnType<NonNullable<TrackingWorkspaceActions["generation"]>["review"]>>;
  actions: NonNullable<TrackingWorkspaceActions["generation"]>;
  onCatalog?: TrackingWorkspaceActions["catalog"];
  onClose: () => void;
  onReviewDraft: (draft: TrackingPromptDraft) => void;
  canWrite: boolean;
}>) {
  const t = useTranslations("projectAiTracking");
  const [preview, setPreview] = useState<SuggestionGenerationPreview | null>(null);
  const [result, setResult] = useState<SuggestionGenerationResult | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureGenerationId, setFailureGenerationId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const version = useRef(0);
  const attempt = useRef<string | null>(null);
  const {
    control,
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof modelSuggestionsPreviewInputSchema>,
    unknown,
    z.output<typeof modelSuggestionsPreviewInputSchema>
  >({
    resolver: zodResolver(modelSuggestionsPreviewInputSchema),
    defaultValues: {
      inputSnapshot: review.inputSnapshot,
      configuration: {
        provider: "dataforseo",
        engine: "chat_gpt",
        model: "",
        languageCode: "en",
        maxOutputTokens: 1024,
        advisoryCostLimitCents: 100,
      },
    },
  });
  const snapshot = watch("inputSnapshot");
  const characters = Array.from(generationCanonicalJson(snapshot)).length;
  const oversized = characters > REVIEWED_CONTEXT_CHARACTER_LIMIT;
  function invalidate() {
    version.current++;
    setPreview(null);
    setConsent(false);
    setResult(null);
  }
  function submit(input: SuggestionGenerationPreviewInput) {
    const request = ++version.current;
    startTransition(async () => {
      try {
        setError(null);
        const next = await actions.preview(input);
        if (version.current !== request) return;
        setPreview(next);
        setConsent(false);
        attempt.current = crypto.randomUUID();
      } catch (cause) {
        if (version.current === request) {
          setError(cause instanceof Error ? cause.message : t("generationUnavailable"));
          if (
            cause instanceof Error &&
            "reason" in cause &&
            (cause.reason === "stale_preview" || cause.reason === "reviewed_context_changed")
          ) {
            setBlocked(false);
            setPreview(null);
            setConsent(false);
            attempt.current = null;
          }
          if (
            cause instanceof Error &&
            "generationId" in cause &&
            typeof cause.generationId === "string"
          )
            setFailureGenerationId(cause.generationId);
        }
      }
    });
  }
  function generate() {
    if (!canWrite || !preview || !consent || !attempt.current || pending || blocked) return;
    const request = ++version.current;
    const key = attempt.current;
    setBlocked(true);
    startTransition(async () => {
      try {
        setError(null);
        const next = await actions.generate(preview, key);
        if (version.current === request) setResult(next);
      } catch (cause) {
        if (version.current === request) {
          setError(cause instanceof Error ? cause.message : t("generationUnavailable"));
          if (
            cause instanceof Error &&
            "reason" in cause &&
            (cause.reason === "stale_preview" || cause.reason === "reviewed_context_changed")
          ) {
            setBlocked(false);
            setPreview(null);
            setConsent(false);
            attempt.current = null;
          }
          if (
            cause instanceof Error &&
            "generationId" in cause &&
            typeof cause.generationId === "string"
          )
            setFailureGenerationId(cause.generationId);
        }
      }
    });
  }
  return (
    <AppDrawer
      open
      title={t("generationTitle")}
      description={t("generationDescription")}
      onClose={onClose}
      sheetOnMobile
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit(submit)}
        onChange={(event) => {
          if (
            !(event.target instanceof HTMLInputElement) ||
            event.target.name !== "generation-consent"
          )
            invalidate();
        }}
      >
        <p className="text-xs text-fg-muted">
          {t("generationContextUpdated", { date: review.contextUpdatedAt ?? t("unknown") })}
        </p>
        <TrackingGenerationFields
          control={control}
          register={register}
          competitors={review.inputSnapshot.competitors}
          onInvalidate={invalidate}
          onCatalog={onCatalog}
        />
        <p className="text-xs text-fg-muted" role="status">
          {t("generationScopeCount", {
            count: characters,
            limit: REVIEWED_CONTEXT_CHARACTER_LIMIT,
          })}
        </p>
        {oversized && (
          <p role="alert" className="text-sm text-red-text">
            {t("generationScopeTooLarge")}
          </p>
        )}
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm text-red-text">
            {errors.configuration?.model?.message ?? t("generationReviewRequired")}
          </p>
        )}
        <Button type="submit" variant="secondary" loading={pending} disabled={oversized || blocked}>
          {t("generationPreview")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-text">
            {error}
          </p>
        )}
        {failureGenerationId && (
          <p className="break-all font-mono text-xs text-fg-muted">
            {t("generationFailureId", { id: failureGenerationId })}
          </p>
        )}
        {blocked && !result && !pending && (
          <p className="text-xs leading-5 text-fg-muted">{t("generationReconcileBeforeRetry")}</p>
        )}
        {preview && (
          <section className="space-y-3 rounded-card border border-border p-4">
            <h2 className="text-sm font-semibold">
              {t("advisoryEstimate", { cost: (preview.estimatedCostCents / 100).toFixed(4) })}
            </h2>
            <p className="text-xs text-fg-muted">{t("generationCostMethod")}</p>
            <p className="text-xs text-fg-muted">{preview.limitations.join(" ")}</p>
            <Checkbox
              name="generation-consent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              label={t("generationConsent")}
            />
            <Button
              disabled={!canWrite || !consent || blocked || pending}
              loading={pending}
              onClick={generate}
            >
              {t("generationGenerate")}
            </Button>
          </section>
        )}
        {result && (
          <section className="space-y-3 rounded-card border border-border p-4">
            <h2 className="text-sm font-semibold">{t("generationDrafts")}</h2>
            <p className="font-mono text-xs text-fg-muted">{result.generationId}</p>
            <p className="text-xs text-fg-muted">
              {t("generationCostReceipt", {
                cost: result.costUsd ?? t("unknown"),
                state: result.costState,
              })}
            </p>
            <p className="text-xs text-fg-muted">{result.limitations.join(" ")}</p>
            {result.drafts.map((draft) => (
              <div key={draft.draftId} className="space-y-2 border-t border-border pt-3">
                <p className="text-sm leading-5">{draft.text}</p>
                <p className="text-xs text-fg-muted">
                  {t(draft.category)} · {t("generatedPrompt")} · {t("popularityUnknown")}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canWrite}
                  onClick={() =>
                    onReviewDraft({
                      text: draft.text,
                      category: draft.category,
                      generationReference: {
                        generationId: result.generationId,
                        draftId: draft.draftId,
                      },
                    })
                  }
                >
                  {t("reviewDraft")}
                </Button>
              </div>
            ))}
          </section>
        )}
      </form>
    </AppDrawer>
  );
}
