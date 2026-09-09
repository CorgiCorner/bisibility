"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { blockedRunPresentation } from "@/lib/rank-check/runs/blocked-presentation";
import type { RunPageSummary } from "./RunPageModel";
import type { RunPageData } from "./RunPageTypes";

type RunMutation = "run-now" | "skip" | "retry-failed" | "retry-deferred";

export function RunPageTargetActions({
  busy,
  canMutate,
  onCancel,
  onMutate,
  run,
  summary,
}: Readonly<{
  busy: string | null;
  canMutate: boolean;
  onCancel: () => void;
  onMutate: (mutation: RunMutation) => void;
  run: RunPageData;
  summary: RunPageSummary;
}>) {
  const deploymentMode = useDeploymentMode();
  if (!canMutate) return null;

  if (run.status === "blocked" && run.trigger === "manual") {
    const presentation = blockedRunPresentation({
      budget: run.budget,
      deploymentMode,
      reason: run.blockedReason,
    });
    return (
      <>
        <Button
          loading={busy === "run-now"}
          onClick={() => onMutate("run-now")}
          size="sm"
          title={presentation.description}
        >
          Retry now
        </Button>
        <Button disabled={busy !== null} onClick={onCancel} size="sm" variant="secondary">
          Cancel run
        </Button>
      </>
    );
  }

  if (summary.planned) {
    return (
      <>
        <Button loading={busy === "run-now"} onClick={() => onMutate("run-now")} size="sm">
          Run now
        </Button>
        <Button
          disabled={busy !== null}
          onClick={() => onMutate("skip")}
          size="sm"
          variant="secondary"
        >
          Skip once
        </Button>
      </>
    );
  }

  if (run.outcome !== "partial" && run.outcome !== "failed" && run.outcome !== "deferred") {
    return null;
  }
  return (
    <>
      {run.counts.failed > 0 ? (
        <Button
          loading={busy === "retry-failed"}
          onClick={() => onMutate("retry-failed")}
          size="sm"
        >
          Retry {run.counts.failed.toLocaleString("en-US")} failed targets
        </Button>
      ) : null}
      {run.counts.deferred > 0 ? (
        <Button
          disabled={busy !== null}
          onClick={() => onMutate("retry-deferred")}
          size="sm"
          variant="secondary"
        >
          Retry {run.counts.deferred.toLocaleString("en-US")} deferred targets
        </Button>
      ) : null}
    </>
  );
}
