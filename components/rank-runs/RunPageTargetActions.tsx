"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { useLocale, useTranslations } from "next-intl";
import type { RunPageData } from "./RunPageTypes";
import { localizedBlockedRunCopy } from "./rank-run-copy";

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
  summary: { planned: boolean };
}>) {
  const deploymentMode = useDeploymentMode();
  const locale = useLocale();
  const t = useTranslations("projectRuns.rankRuns");
  if (!canMutate) return null;

  if (run.status === "blocked" && run.trigger === "manual") {
    const presentation = localizedBlockedRunCopy(
      {
        budget: run.budget,
        deploymentMode,
        reason: run.blockedReason,
      },
      t,
      locale,
    );
    return (
      <>
        <Button
          loading={busy === "run-now"}
          onClick={() => onMutate("run-now")}
          size="sm"
          title={presentation.description}
        >
          {t("retryNow")}
        </Button>
        <Button disabled={busy !== null} onClick={onCancel} size="sm" variant="secondary">
          {t("cancelRun")}
        </Button>
      </>
    );
  }

  if (summary.planned) {
    return (
      <>
        <Button loading={busy === "run-now"} onClick={() => onMutate("run-now")} size="sm">
          {t("startRun")}
        </Button>
        <Button
          disabled={busy !== null}
          onClick={() => onMutate("skip")}
          size="sm"
          variant="secondary"
        >
          {t("skipOnce")}
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
          {t("retryFailed", { count: run.counts.failed })}
        </Button>
      ) : null}
      {run.counts.deferred > 0 ? (
        <Button
          disabled={busy !== null}
          onClick={() => onMutate("retry-deferred")}
          size="sm"
          variant="secondary"
        >
          {t("retryDeferred", { count: run.counts.deferred })}
        </Button>
      ) : null}
    </>
  );
}
