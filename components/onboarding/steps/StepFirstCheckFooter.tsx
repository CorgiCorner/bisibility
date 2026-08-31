import { Button } from "@/components/ui";
import type { ReactNode, RefCallback } from "react";
import type { FirstCheckRunState } from "./use-first-check-run";

type Props = {
  backAction: ReactNode;
  canPreview: boolean;
  onPreview: () => void;
  previewDisabled: boolean;
  runButtonRef?: RefCallback<HTMLButtonElement>;
  sampleCount: number;
  matrixLabel?: string | null;
  state: FirstCheckRunState;
  submitting: boolean;
};
export function StepFirstCheckFooter({
  backAction,
  canPreview,
  matrixLabel,
  onPreview,
  previewDisabled,
  runButtonRef,
  sampleCount,
  state,
  submitting,
}: Readonly<Props>) {
  const previewAvailable = canPreview && state.status !== "completed";
  const dashboardIsPrimary = !previewAvailable || state.status === "completed";

  return (
    <footer className="mt-7 flex items-center justify-between gap-3 border-border border-t pt-5">
      {backAction}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {matrixLabel ? (
          <span className="w-full text-right text-xs text-fg-muted">{matrixLabel}</span>
        ) : null}
        <Button
          disabled={submitting}
          size="lg"
          sx={
            dashboardIsPrimary
              ? undefined
              : { color: "var(--fg-muted)", fontSize: 13, paddingX: "8px" }
          }
          type="submit"
          variant={dashboardIsPrimary ? "primary" : "ghost"}
        >
          {state.status === "completed" ? "Go to dashboard" : "Open app"}
        </Button>
        {previewAvailable ? (
          <Button
            id="onboarding-first-check-run"
            disabled={previewDisabled}
            loading={state.status === "running"}
            ref={runButtonRef}
            loadingLabel={`Running ${sampleCount} sample ${sampleCount === 1 ? "check" : "checks"}`}
            onClick={onPreview}
            size="lg"
            type="button"
            variant="primary"
          >
            <span>Run a test check (1 keyword)</span>
          </Button>
        ) : null}
      </div>
    </footer>
  );
}
