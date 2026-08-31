import { SetupProgressRing } from "@/components/getting-started/SetupProgressRing";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import {
  type CompletionAcknowledgementMode,
  gettingStartedHeaderProgressModel,
  type ResolvedSetupProgress,
} from "./getting-started-header-progress";

export type GettingStartedHeaderProgressProps = Readonly<{
  completionMode: CompletionAcknowledgementMode;
  progress: ResolvedSetupProgress;
  projectRef: string;
}>;

export function GettingStartedHeaderProgress({
  completionMode,
  progress,
  projectRef,
}: GettingStartedHeaderProgressProps) {
  const model = gettingStartedHeaderProgressModel(progress, projectRef, completionMode);

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div
        className="flex min-w-0 items-center gap-2"
        aria-label={`Get set up, ${model.countLabel}`}
      >
        <span className="text-[15px] font-semibold leading-[1.35] text-fg">Get set up</span>
        <span aria-hidden className="text-[13.5px] leading-[1.35] text-fg-muted">
          ·
        </span>
        {model.showCheck ? (
          <Check
            aria-label="Setup complete"
            className="text-green-text"
            data-testid="setup-progress-check"
            size={22}
            weight="regular"
          />
        ) : (
          <>
            <span className="size-[22px] shrink-0" data-testid="setup-progress-indicator">
              <SetupProgressRing doneCount={progress.doneCount} totalCount={progress.totalCount} />
            </span>
            <span className="text-[13.5px] leading-[1.35] text-fg-muted">{model.countLabel}</span>
          </>
        )}
      </div>
      {model.dashboardHref ? (
        <Link
          aria-hidden={model.dashboardVisibility === "hidden" || undefined}
          className="text-[13px] font-semibold text-accent-text hover:text-accent"
          hidden={model.dashboardVisibility === "hidden"}
          href={model.dashboardHref}
          tabIndex={model.dashboardVisibility === "hidden" ? -1 : undefined}
        >
          Go to dashboard
        </Link>
      ) : null}
    </div>
  );
}
