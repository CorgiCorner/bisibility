"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import type { TrackingPromptDraft } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { TrackingGenerationDrawer } from "./TrackingGenerationDrawer";

export function TrackingGeneration({
  actions,
  onCatalog,
  canWrite,
  onReviewDraft,
}: Readonly<{
  actions?: TrackingWorkspaceActions["generation"];
  onCatalog?: TrackingWorkspaceActions["catalog"];
  canWrite: boolean;
  onReviewDraft: (draft: TrackingPromptDraft) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  const [review, setReview] = useState<Awaited<
    ReturnType<NonNullable<typeof actions>["review"]>
  > | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const version = useRef(0);
  function close() {
    version.current++;
    setOpen(false);
    setReview(null);
  }
  return (
    <section className="rounded-card border border-border bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("generationTitle")}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t("generationDescription")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!actions}
          onClick={() => {
            const request = ++version.current;
            setOpen(true);
            setReview(null);
            setError(null);
            startTransition(async () => {
              try {
                if (actions) {
                  const next = await actions.review();
                  if (version.current === request) setReview(next);
                }
              } catch (cause) {
                if (version.current === request)
                  setError(cause instanceof Error ? cause.message : t("generationUnavailable"));
              }
            });
          }}
        >
          {t("generationReviewContext")}
        </Button>
      </div>
      {open && review && actions ? (
        <TrackingGenerationDrawer
          review={review}
          actions={actions}
          canWrite={canWrite}
          onCatalog={onCatalog}
          onClose={close}
          onReviewDraft={(draft) => {
            close();
            onReviewDraft(draft);
          }}
        />
      ) : (
        open && (
          <AppDrawer open title={t("generationTitle")} onClose={close}>
            <p role={error ? "alert" : "status"} className="text-sm text-fg-muted">
              {error ?? (pending ? t("generationLoadingContext") : t("generationUnavailable"))}
            </p>
          </AppDrawer>
        )
      )}
    </section>
  );
}
