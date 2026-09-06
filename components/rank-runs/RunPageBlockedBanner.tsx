"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui";
import { blockedRunPresentation } from "@/lib/rank-check/runs/blocked-presentation";
import { appPath, appRootPath, type ProjectRef } from "@/lib/routing/app-path";
import type { RunPageData } from "./RunPageTypes";

function actionHref(
  action: ReturnType<typeof blockedRunPresentation>["action"],
  projectRef: ProjectRef,
) {
  if (action === "connection_settings") return appPath(projectRef, "integrations");
  if (action === "edit_budget") return appPath(projectRef, "settings", "usage?budget=edit");
  if (action === "worker_status") return appRootPath("admin");
  return null;
}

function actionLabel(action: ReturnType<typeof blockedRunPresentation>["action"]) {
  if (action === "connection_settings") return "Connection settings";
  if (action === "edit_budget") return "Edit budget";
  if (action === "worker_status") return "Worker status";
  return null;
}

export function RunPageBlockedBanner({
  projectRef,
  run,
}: Readonly<{ projectRef: ProjectRef; run: RunPageData }>) {
  const deploymentMode = useDeploymentMode();
  if (run.status !== "blocked") return null;

  const presentation = blockedRunPresentation({
    budget: run.budget,
    deploymentMode,
    reason: run.blockedReason,
  });
  const action = actionLabel(presentation.action);
  const href = actionHref(presentation.action, projectRef);

  return (
    <section
      aria-label="Blocked run guidance"
      className="flex flex-wrap items-center gap-3 rounded-card border border-yellow/35 bg-yellow/10 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold text-fg">{presentation.title}</h2>
        <p className="m-0 mt-0.5 text-[12px] leading-[1.5] text-fg-muted">
          {presentation.description}
        </p>
      </div>
      {action && href ? (
        <Button href={href} size="xs" variant="secondary">
          {action}
        </Button>
      ) : null}
    </section>
  );
}
