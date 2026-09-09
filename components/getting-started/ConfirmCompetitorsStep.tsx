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

const blockedBody =
  "Suggestions use your completed rank checks. This step opens after your first check.";
const readyBody = "Choose competitors to track. You can change this later in Settings.";
const skippedBody =
  "Skipped. Nothing is tracked as a competitor, and share of voice stays off until you confirm a set.";

function trackLabel(count: number) {
  if (count === 0) return "Track selected";
  return `Track ${count} competitor${count === 1 ? "" : "s"}`;
}

export function ConfirmCompetitorsStep({
  actions,
  projectId,
  state,
  suggestions,
}: ConfirmCompetitorsStepProps) {
  const router = useRouter();
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(() => new Set());
  const [confirmedDomains, setConfirmedDomains] = useState<Set<string>>(() => new Set());
  const [dismissedDomains, setDismissedDomains] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [dialogView, setDialogView] = useState<"suggestions" | "manual" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localOutcome, setLocalOutcome] = useState<"confirmed" | "skipped" | null>(null);
  if (state.family === "blocked") {
    return <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{blockedBody}</p>;
  }

  if (state.family === "skipped" || localOutcome === "skipped") {
    return <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{skippedBody}</p>;
  }

  if (state.family === "done" || localOutcome === "confirmed") {
    return (
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        Confirmed. Your selected competitors are now tracked.
      </p>
    );
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
      setActionError("Could not confirm every selected competitor. Try again.");
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
      setActionError(actionErrorMessage(error, "Competitor could not be removed."));
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
      setActionError(actionErrorMessage(error, "Competitor setup could not be skipped."));
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
        {hasSuggestions
          ? readyBody
          : "No suggestions yet. Add a competitor or do this later in Settings."}
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
          {hasSuggestions ? "Review competitors" : "Add your own"}
        </Button>
        {confirmedDomains.size === 0 ? (
          <Button
            disabled={isSaving}
            onClick={() => void skipForNow()}
            size="sm"
            type="button"
            variant="ghost"
          >
            Skip for now
          </Button>
        ) : null}
      </div>
      {dialogView ? null : errorNotice}
      <Modal
        dismissDisabled={isSaving}
        onClose={() => setDialogView(null)}
        open={dialogView !== null}
        size="md"
        title={dialogView === "manual" ? "Add competitor" : "Review competitors"}
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
                Add your own
              </Button>
              <Button
                disabled={isSaving || selectedSuggestions.length === 0}
                onClick={() => void trackSelected()}
                size="sm"
                type="button"
              >
                {isSaving ? "Saving..." : trackLabel(selectedSuggestions.length)}
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
            cancelLabel={hasSuggestions ? "Back" : "Cancel"}
            projectId={projectId}
          />
        ) : (
          <>
            <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
              Select the domains you want to track.
            </p>
            {hasSuggestions ? (
              <CompetitorSuggestionList
                suggestions={visibleSuggestions}
                selectedDomains={selectedDomains}
                disabled={isSaving}
                onToggle={toggleSuggestion}
                onDismiss={(domain) => void dismissSuggestion(domain)}
              />
            ) : (
              <p className="mt-3 text-[13px] text-fg-muted">
                No suggestions left. You can add your own competitor.
              </p>
            )}
            {errorNotice}
          </>
        )}
      </Modal>
    </div>
  );
}
