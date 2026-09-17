import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding.firstCheck");
  const previewAvailable = canPreview && state.status !== "completed";
  const dashboardIsPrimary = !previewAvailable || state.status === "completed";

  return (
    <footer className="-mx-6 mt-7 space-y-3 border-border border-t px-6 pt-5 sm:-mx-7 sm:px-7">
      {matrixLabel || previewAvailable ? (
        <div className="space-y-1 text-xs text-fg-muted sm:text-right">
          {matrixLabel ? <p className="m-0">{matrixLabel}</p> : null}
          {previewAvailable ? (
            <p className="m-0" id="onboarding-first-check-hint">
              {t("footer.hint")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {backAction}
        <div className="ml-auto flex items-center gap-3">
          <Button
            disabled={submitting}
            size="lg"
            style={
              dashboardIsPrimary
                ? undefined
                : {
                    "--control-color": "var(--fg-muted)",
                    fontSize: 13,
                    paddingLeft: "8px",
                    paddingRight: "8px",
                  }
            }
            type="submit"
            variant={dashboardIsPrimary ? "primary" : "ghost"}
          >
            {state.status === "completed" ? t("footer.viewDashboard") : t("footer.openApp")}
          </Button>
          {previewAvailable ? (
            <Button
              aria-describedby="onboarding-first-check-hint"
              id="onboarding-first-check-run"
              disabled={previewDisabled || state.status === "queued" || state.status === "running"}
              loading={state.status === "running"}
              ref={runButtonRef}
              loadingLabel={t("footer.running", { count: sampleCount })}
              onClick={onPreview}
              size="lg"
              type="button"
              variant="primary"
            >
              <span>{state.status === "queued" ? t("footer.queued") : t("footer.run")}</span>
            </Button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
