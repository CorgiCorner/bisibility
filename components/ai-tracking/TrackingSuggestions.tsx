"use client";
import { Button } from "@/components/ui/Button";
import { PillBadge } from "@/components/ui/Pill";
import type { TrackingSuggestion } from "@/lib/ai-tracking/suggestions/context";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
export function TrackingSuggestions({
  canWrite,
  onSuggest,
  onReview,
}: Readonly<{
  canWrite: boolean;
  onSuggest: () => Promise<{ drafts: TrackingSuggestion[]; method: string; limitations: string[] }>;
  onReview: (text: string, category: TrackingSuggestion["category"]) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  const [drafts, setDrafts] = useState<TrackingSuggestion[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="rounded-card border border-border bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("contextPromptDrafts")}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-muted">{t("contextDraftMethod")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canWrite}
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setError(null);
                const result = await onSuggest();
                setDrafts(result.drafts);
                setLimitations(result.limitations);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t("suggestionsUnavailable"));
              }
            })
          }
        >
          {t("suggestFromContext")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-text">
          {error}
        </p>
      )}
      {drafts.map((draft) => (
        <div
          key={draft.text}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5">{draft.text}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <PillBadge>{t(draft.category)}</PillBadge>
              <PillBadge>{draft.provenance}</PillBadge>
              <span className="text-xs text-fg-muted">{t("popularityUnknown")}</span>
            </div>
          </div>
          <Button
            size="xs"
            variant="secondary"
            disabled={!canWrite}
            onClick={() => onReview(draft.text, draft.category)}
          >
            {t("reviewDraft")}
          </Button>
        </div>
      ))}
      {limitations.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-fg-muted">{limitations.join(" ")}</p>
      )}
    </section>
  );
}
