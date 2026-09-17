"use client";

import { ConfirmCompetitorsManualForm } from "@/components/getting-started/ConfirmCompetitorsManualForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type {
  CompetitorSuggestionEvidence,
  SetupStepState,
} from "@/lib/getting-started/setup-steps";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CompetitorSuggestionList } from "./CompetitorSuggestionList";

export type CompetitorSetupActions = Readonly<{
  addManualCompetitor: (input: unknown) => Promise<unknown>;
  confirmSuggestedCompetitor: (input: unknown) => Promise<unknown>;
  dismissCompetitorSuggestion: (input: unknown) => Promise<unknown>;
  skipCompetitorSetup: (input: unknown) => Promise<unknown>;
}>;

type ConfirmCompetitorsStepProps = Readonly<{
  actions: CompetitorSetupActions;
  projectId: string;
  state: SetupStepState;
  suggestions: CompetitorSuggestionEvidence[];
}>;

export function ConfirmCompetitorsStep({
  actions,
  projectId,
  state,
  suggestions,
}: ConfirmCompetitorsStepProps) {
  const router = useRouter();
  const t = useTranslations("projectGettingStarted.competitors");
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(() => new Set());
  const [confirmedDomains, setConfirmedDomains] = useState<Set<string>>(() => new Set());
  const [dismissedDomains, setDismissedDomains] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [dialogView, setDialogView] = useState<"suggestions" | "manual" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localOutcome, setLocalOutcome] = useState<"confirmed" | "skipped" | null>(null);
  if (state.family === "blocked") {
    return <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{t("blocked")}</p>;
  }

  if (state.family === "skipped" || localOutcome === "skipped") {
    return <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{t("skipped")}</p>;
  }

  if (state.family === "done" || localOutcome === "confirmed") {
    return <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{t("confirmed")}</p>;
  }

  const visibleSuggestions = suggestions.filter(
    ({ domain }) => !dismissedDomains.has(domain) && !confirmedDomains.has(domain),
  );
  const selectedSuggestions = visibleSuggestions.filter(({ domain }) =>
    selectedDomains.has(domain),
  );

  function toggleSuggestion(domain: string, checked: boolean) {
    setSelectedDomains((current) => {
      const next = new Set(current);
      if (checked) next.add(domain);
      else next.delete(domain);
      return next;
    });
  }

  async function trackSelected() {
    setActionError(null);
    setIsSaving(true);
    const results = await Promise.allSettled(
      selectedSuggestions.map(({ domain }) =>
        actions.confirmSuggestedCompetitor({ domain, projectId }),
      ),
    );
    setIsSaving(false);
    const successfulDomains = selectedSuggestions.flatMap(({ domain }, index) =>
      results[index]?.status === "fulfilled" ? [domain] : [],
    );
    const failedDomains = selectedSuggestions.flatMap(({ domain }, index) =>
      results[index]?.status === "rejected" ? [domain] : [],
    );
    setConfirmedDomains((current) => new Set([...current, ...successfulDomains]));
    setSelectedDomains(new Set(failedDomains));
    if (failedDomains.length > 0) {
      setActionError(t("confirmError"));
      return;
    }
    setDialogView(null);
    setLocalOutcome("confirmed");
    router.refresh();
  }

  async function dismissSuggestion(domain: string) {
    setActionError(null);
    setIsSaving(true);
    try {
      await actions.dismissCompetitorSuggestion({ domain, projectId });
      setDismissedDomains((current) => new Set(current).add(domain));
      setSelectedDomains((current) => {
        const next = new Set(current);
        next.delete(domain);
        return next;
      });
    } catch (error) {
      setActionError(actionErrorMessage(error, t("dismissError")));
    } finally {
      setIsSaving(false);
    }
  }

  async function skipForNow() {
    setActionError(null);
    setIsSaving(true);
    try {
      const result = (await actions.skipCompetitorSetup({ projectId })) as {
        outcome: "confirmed" | "skipped";
      };
      setLocalOutcome(result.outcome);
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, t("skipError")));
    } finally {
      setIsSaving(false);
    }
  }

  async function addManualCompetitor(input: unknown) {
    setIsSaving(true);
    try {
      const result = await actions.addManualCompetitor(input);
      setLocalOutcome("confirmed");
      router.refresh();
      return result;
    } finally {
      setIsSaving(false);
    }
  }

  const hasSuggestions = visibleSuggestions.length > 0;
  const errorNotice = actionError ? (
    <p role="alert" className="mt-2 text-[12px] text-red-text">
      {actionError}
    </p>
  ) : null;

  return (
    <div className="max-w-[440px]">
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {hasSuggestions ? t("ready") : t("none")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={isSaving}
          onClick={() => {
            setActionError(null);
            setDialogView(hasSuggestions ? "suggestions" : "manual");
          }}
          size="sm"
          type="button"
        >
          {hasSuggestions ? t("review") : t("addOwn")}
        </Button>
        {confirmedDomains.size === 0 ? (
          <Button
            disabled={isSaving}
            onClick={() => void skipForNow()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("skip")}
          </Button>
        ) : null}
      </div>
      {dialogView ? null : errorNotice}
      <Modal
        dismissDisabled={isSaving}
        onClose={() => setDialogView(null)}
        open={dialogView !== null}
        size="md"
        title={dialogView === "manual" ? t("modalAdd") : t("modalReview")}
        footer={
          dialogView === "suggestions" ? (
            <>
              <Button
                disabled={isSaving}
                onClick={() => {
                  setActionError(null);
                  setDialogView("manual");
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("addOwn")}
              </Button>
              <Button
                disabled={isSaving || selectedSuggestions.length === 0}
                onClick={() => void trackSelected()}
                size="sm"
                type="button"
              >
                {isSaving
                  ? t("saving")
                  : selectedSuggestions.length === 0
                    ? t("trackSelected")
                    : t("trackCount", { count: selectedSuggestions.length })}
              </Button>
            </>
          ) : undefined
        }
      >
        {dialogView === "manual" ? (
          <ConfirmCompetitorsManualForm
            addManualCompetitor={addManualCompetitor}
            onClose={() => setDialogView(null)}
            onCancel={() => setDialogView(hasSuggestions ? "suggestions" : null)}
            cancelLabel={hasSuggestions ? t("back") : t("cancel")}
            projectId={projectId}
          />
        ) : (
          <>
            <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{t("select")}</p>
            {hasSuggestions ? (
              <CompetitorSuggestionList
                suggestions={visibleSuggestions}
                selectedDomains={selectedDomains}
                disabled={isSaving}
                onToggle={toggleSuggestion}
                onDismiss={(domain) => void dismissSuggestion(domain)}
              />
            ) : (
              <p className="mt-3 text-[13px] text-fg-muted">{t("noneLeft")}</p>
            )}
            {errorNotice}
          </>
        )}
      </Modal>
    </div>
  );
}
